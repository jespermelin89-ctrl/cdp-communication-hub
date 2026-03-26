/**
 * AuthService - Handles Google OAuth and JWT session management.
 */

import jwt from 'jsonwebtoken';
import { google } from 'googleapis';
import { prisma } from '../config/database';
import { env } from '../config/env';
import { oauth2Client, getAuthUrl, exchangeCode } from '../config/oauth';
import { encrypt } from '../utils/encryption';
import { actionLogService } from './action-log.service';
import { detectProvider } from '../config/email-providers';

interface JwtPayload {
  userId: string;
  email: string;
}

export class AuthService {
  /**
   * Generate the Google OAuth consent URL.
   */
  getConsentUrl(): string {
    return getAuthUrl();
  }

  /**
   * Generate OAuth consent URL for a specific email address.
   * Detects the provider and includes login_hint for Google.
   * For non-OAuth providers, throws an error.
   */
  getConsentUrlForEmail(email: string): string {
    const provider = detectProvider(email);

    if (provider.authMethod !== 'oauth') {
      throw new Error(
        `Provider "${provider.name}" does not support OAuth. Use IMAP instead.`
      );
    }

    if (provider.type === 'google') {
      // Generate Google OAuth URL with login_hint to pre-select the account
      return getAuthUrl(undefined, email);
    }

    if (provider.type === 'microsoft') {
      throw new Error('Microsoft OAuth is coming soon. Please use IMAP authentication for now.');
    }

    throw new Error(`OAuth not yet supported for provider: ${provider.name}`);
  }

  /**
   * Handle the OAuth callback: exchange code, get user info, create/update user and account.
   */
  async handleCallback(code: string) {
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

    // Upsert user
    const user = await prisma.user.upsert({
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
    const token = this.generateJwt(user.id, user.email);

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
      account: {
        id: account.id,
        email: account.emailAddress,
      },
    };
  }

  /**
   * Generate a JWT for the user session.
   */
  generateJwt(userId: string, email: string): string {
    return jwt.sign(
      { userId, email } as JwtPayload,
      env.JWT_SECRET,
      { expiresIn: env.JWT_EXPIRES_IN }
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
