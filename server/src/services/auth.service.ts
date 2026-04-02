/**
 * AuthService - Handles Google OAuth and JWT session management.
 */

import jwt from 'jsonwebtoken';
import { google } from 'googleapis';
import { prisma } from '../config/database';
import { env } from '../config/env';
import {
  oauth2Client,
  getAuthUrl,
  exchangeCode,
  type GoogleAuthFeature,
} from '../config/oauth';
import { encrypt } from '../utils/encryption';
import { actionLogService } from './action-log.service';
import { detectProvider } from '../config/email-providers';

interface JwtPayload {
  userId: string;
  email: string;
}

type ReauthOptions = {
  feature?: GoogleAuthFeature;
  returnTo?: string;
};

export class AuthService {
  /**
   * Generate the Google OAuth consent URL.
   */
  getConsentUrl(): string {
    return getAuthUrl();
  }

  /**
   * Generate an OAuth re-authentication URL for an existing account.
   * The state embeds the accountId so the callback can restore the account.
   */
  getReauthUrl(accountId: string, options: ReauthOptions = {}): string {
    const state = JSON.stringify({
      mode: 'reauth',
      accountId,
      feature: options.feature,
      returnTo: options.returnTo,
    });
    return getAuthUrl(state, undefined, { feature: options.feature });
  }

  /**
   * Generate OAuth consent URL for a specific email address.
   * Detects the provider and includes login_hint for Google.
   * If existingToken is provided, it's embedded in OAuth state so the callback
   * can add the account to the existing user instead of creating a new session.
   */
  getConsentUrlForEmail(email: string, existingToken?: string): string {
    const provider = detectProvider(email);

    if (provider.authMethod !== 'oauth') {
      throw new Error(
        `Provider "${provider.name}" does not support OAuth. Use IMAP instead.`
      );
    }

    if (provider.type === 'google') {
      // Build state: encode existing token so callback knows to add-account
      const state = existingToken
        ? JSON.stringify({ mode: 'add_account', token: existingToken })
        : undefined;
      return getAuthUrl(state, email);
    }

    if (provider.type === 'microsoft') {
      throw new Error('Microsoft OAuth is coming soon. Please use IMAP authentication for now.');
    }

    throw new Error(`OAuth not yet supported for provider: ${provider.name}`);
  }

  /**
   * Handle the OAuth callback: exchange code, get user info, create/update user and account.
   * If state contains a valid JWT (add_account mode), the new email is linked to the existing user.
   */
  async handleCallback(code: string, state?: string) {
    // Exchange authorization code for tokens
    const tokens = await exchangeCode(code);

    if (!tokens.access_token || !tokens.refresh_token) {
      throw new Error('Failed to get tokens from Google. Make sure prompt=consent is set.');
    }

    // Get user info from Google
    oauth2Client.setCredentials(tokens);
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const userInfo = await oauth2.userinfo.get();

    if (!userInfo.data.email) {
      throw new Error('Could not get email from Google account.');
    }

    // Check if this is an "add account" or "reauth" flow
    let existingUserId: string | null = null;
    let isAddAccountMode = false;
    let isReauthMode = false;
    let reauthAccountId: string | null = null;
    let reauthFeature: GoogleAuthFeature | undefined;
    let reauthReturnTo: string | undefined;

    if (state) {
      try {
        const parsed = JSON.parse(state);
        if (parsed.mode === 'add_account' && parsed.token) {
          const decoded = this.verifyJwt(parsed.token);
          existingUserId = decoded.userId;
          isAddAccountMode = true;
        } else if (parsed.mode === 'reauth' && parsed.accountId) {
          isReauthMode = true;
          reauthAccountId = parsed.accountId;
          reauthFeature = parsed.feature;
          reauthReturnTo = parsed.returnTo;
        }
      } catch {
        // Invalid state — fall through to normal login flow
      }
    }

    let user;
    let returnToken: string;

    if (isReauthMode && reauthAccountId) {
      // REAUTH MODE: restore tokens for a previously-revoked account
      const account = await prisma.emailAccount.findUniqueOrThrow({
        where: { id: reauthAccountId },
      });
      const user = await prisma.user.findUniqueOrThrow({ where: { id: account.userId } });

      await prisma.emailAccount.update({
        where: { id: reauthAccountId },
        data: {
          accessTokenEncrypted: encrypt(tokens.access_token),
          refreshTokenEncrypted: encrypt(tokens.refresh_token),
          tokenExpiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
          isActive: true,
          syncError: null,
        },
      });

      await actionLogService.log(user.id, 'reauth_completed', 'account', reauthAccountId, {
        email: userInfo.data.email,
      });

      const returnToken = this.generateJwt(user.id, user.email);
      return {
        token: returnToken,
        user: { id: user.id, email: user.email, name: user.name },
        account: { id: account.id, email: account.emailAddress },
        addedAccount: false,
        reauthed: true,
        feature: reauthFeature,
        returnTo: reauthReturnTo,
      };
    }

    if (isAddAccountMode && existingUserId) {
      // ADD ACCOUNT MODE: Link the new email to the existing user
      user = await prisma.user.findUniqueOrThrow({
        where: { id: existingUserId },
      });

      // Upsert email account under the EXISTING user
      const account = await prisma.emailAccount.upsert({
        where: {
          userId_emailAddress: {
            userId: user.id,
            emailAddress: userInfo.data.email,
          },
        },
        update: {
          accessTokenEncrypted: encrypt(tokens.access_token),
          refreshTokenEncrypted: encrypt(tokens.refresh_token),
          tokenExpiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
        },
        create: {
          userId: user.id,
          provider: 'gmail',
          emailAddress: userInfo.data.email,
          accessTokenEncrypted: encrypt(tokens.access_token),
          refreshTokenEncrypted: encrypt(tokens.refresh_token),
          tokenExpiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
          isDefault: false, // Not default — user already has a primary account
        },
      });

      await actionLogService.log(user.id, 'account_connected', 'account', account.id, {
        email: userInfo.data.email,
        provider: 'gmail',
        mode: 'add_account',
      });

      // Return the SAME token (keep existing session)
      returnToken = this.generateJwt(user.id, user.email);

      return {
        token: returnToken,
        user: { id: user.id, email: user.email, name: user.name },
        account: { id: account.id, email: account.emailAddress },
        addedAccount: true,
      };
    }

    // NORMAL LOGIN FLOW: Create or update user based on OAuth email
    user = await prisma.user.upsert({
      where: { email: userInfo.data.email },
      update: {
        name: userInfo.data.name || undefined,
        googleId: userInfo.data.id || undefined,
      },
      create: {
        email: userInfo.data.email,
        name: userInfo.data.name || null,
        googleId: userInfo.data.id || null,
      },
    });

    // Upsert email account with encrypted tokens
    const account = await prisma.emailAccount.upsert({
      where: {
        userId_emailAddress: {
          userId: user.id,
          emailAddress: userInfo.data.email,
        },
      },
      update: {
        accessTokenEncrypted: encrypt(tokens.access_token),
        refreshTokenEncrypted: encrypt(tokens.refresh_token),
        tokenExpiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
      },
      create: {
        userId: user.id,
        provider: 'gmail',
        emailAddress: userInfo.data.email,
        accessTokenEncrypted: encrypt(tokens.access_token),
        refreshTokenEncrypted: encrypt(tokens.refresh_token),
        tokenExpiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
        isDefault: true, // First account is default
      },
    });

    // Ensure user has settings
    await prisma.userSettings.upsert({
      where: { userId: user.id },
      update: {},
      create: {
        userId: user.id,
        defaultAccountId: account.id,
      },
    });

    // Log the connection
    await actionLogService.log(user.id, 'account_connected', 'account', account.id, {
      email: userInfo.data.email,
      provider: 'gmail',
    });

    // Generate JWT
    returnToken = this.generateJwt(user.id, user.email);

    return {
      token: returnToken,
      user: { id: user.id, email: user.email, name: user.name },
      account: { id: account.id, email: account.emailAddress },
      addedAccount: false,
    };
  }

  /**
   * Generate a JWT for the user session.
   */
  generateJwt(userId: string, email: string): string {
    return jwt.sign(
      { userId, email } as JwtPayload,
      env.JWT_SECRET,
      // expiresIn cast needed due to @types/jsonwebtoken StringValue constraint
      { expiresIn: env.JWT_EXPIRES_IN as any }
    );
  }

  /**
   * Verify and decode a JWT.
   */
  verifyJwt(token: string): JwtPayload {
    return jwt.verify(token, env.JWT_SECRET) as JwtPayload;
  }

  /**
   * Get current user profile with their accounts.
   */
  async getProfile(userId: string) {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: {
        accounts: {
          select: {
            id: true,
            emailAddress: true,
            provider: true,
            isDefault: true,
            label: true,
          },
        },
        settings: true,
      },
    });

    return user;
  }
}

// Singleton
export const authService = new AuthService();
