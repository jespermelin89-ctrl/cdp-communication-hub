import { google } from 'googleapis';
import { env } from './env';

// Google OAuth2 client - shared instance
export const oauth2Client = new google.auth.OAuth2(
  env.GOOGLE_CLIENT_ID,
  env.GOOGLE_CLIENT_SECRET,
  env.GOOGLE_REDIRECT_URI
);

// Required Gmail scopes
export const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
];

/**
 * Generate the Google OAuth consent URL
 * @param state Optional state parameter for CSRF protection
 * @param loginHint Optional email address to pre-select in Google login
 */
export function getAuthUrl(state?: string, loginHint?: string): string {
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: GMAIL_SCOPES,
    prompt: 'consent', // Force consent to always get refresh token
    state,
    ...(loginHint && { login_hint: loginHint }),
  });
}

/**
 * Exchange authorization code for tokens
 */
export async function exchangeCode(code: string) {
  const { tokens } = await oauth2Client.getToken(code);
  return tokens;
}
