import { google } from 'googleapis';
import { env } from './env';

// Google OAuth2 client - shared instance
export const oauth2Client = new google.auth.OAuth2(
  env.GOOGLE_CLIENT_ID,
  env.GOOGLE_CLIENT_SECRET,
  env.GOOGLE_REDIRECT_URI
);

export const GOOGLE_USERINFO_SCOPES = [
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
];

// Required Gmail scopes
export const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.modify',
  ...GOOGLE_USERINFO_SCOPES,
];

export const GOOGLE_CALENDAR_READONLY_SCOPE =
  'https://www.googleapis.com/auth/calendar.readonly';
export const GOOGLE_CALENDAR_EVENTS_SCOPE =
  'https://www.googleapis.com/auth/calendar.events';

export type GoogleAuthFeature = 'calendar' | 'calendar_write';

type GetAuthUrlOptions = {
  feature?: GoogleAuthFeature;
};

export function getGoogleScopes(options: GetAuthUrlOptions = {}): string[] {
  if (options.feature === 'calendar_write') {
    return [...GMAIL_SCOPES, GOOGLE_CALENDAR_READONLY_SCOPE, GOOGLE_CALENDAR_EVENTS_SCOPE];
  }

  if (options.feature === 'calendar') {
    return [...GMAIL_SCOPES, GOOGLE_CALENDAR_READONLY_SCOPE];
  }

  return GMAIL_SCOPES;
}

/**
 * Generate the Google OAuth consent URL
 * @param state Optional state parameter for CSRF protection
 * @param loginHint Optional email address to pre-select in Google login
 */
export function getAuthUrl(
  state?: string,
  loginHint?: string,
  options: GetAuthUrlOptions = {}
): string {
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: getGoogleScopes(options),
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
