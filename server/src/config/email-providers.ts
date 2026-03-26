/**
 * Email Provider Registry
 *
 * Maps email domains to provider configurations for auto-detection and OAuth flows.
 * Supports both OAuth providers (Google, Microsoft) and IMAP/SMTP providers.
 */

export type ProviderType = 'google' | 'microsoft' | 'yahoo' | 'imap';

export interface EmailProviderConfig {
  id: string;
  name: string;
  type: ProviderType;
  icon: string; // emoji or icon name
  authMethod: 'oauth' | 'imap';
  domains: string[];
  // IMAP defaults for known providers
  imapDefaults?: {
    host: string;
    port: number;
    secure: boolean;
  };
  smtpDefaults?: {
    host: string;
    port: number;
    secure: boolean;
  };
}

/**
 * Provider registry with known providers
 */
const PROVIDERS: EmailProviderConfig[] = [
  {
    id: 'google',
    name: 'Google',
    type: 'google',
    icon: '📧',
    authMethod: 'oauth',
    domains: ['gmail.com', 'googlemail.com'],
  },
  {
    id: 'microsoft',
    name: 'Microsoft',
    type: 'microsoft',
    icon: '📨',
    authMethod: 'imap', // OAuth coming soon; for now use IMAP
    domains: ['outlook.com', 'hotmail.com', 'live.com', 'msn.com'],
    imapDefaults: {
      host: 'outlook.office365.com',
      port: 993,
      secure: true,
    },
    smtpDefaults: {
      host: 'smtp.office365.com',
      port: 587,
      secure: true,
    },
  },
  {
    id: 'yahoo',
    name: 'Yahoo',
    type: 'yahoo',
    icon: '📬',
    authMethod: 'imap',
    domains: ['yahoo.com', 'yahoo.se', 'ymail.com', 'rocketmail.com'],
    imapDefaults: {
      host: 'imap.mail.yahoo.com',
      port: 993,
      secure: true,
    },
    smtpDefaults: {
      host: 'smtp.mail.yahoo.com',
      port: 465,
      secure: true,
    },
  },
  {
    id: 'icloud',
    name: 'iCloud',
    type: 'imap',
    icon: '☁️',
    authMethod: 'imap',
    domains: ['icloud.com', 'me.com', 'mac.com'],
    imapDefaults: {
      host: 'imap.mail.me.com',
      port: 993,
      secure: true,
    },
    smtpDefaults: {
      host: 'smtp.mail.me.com',
      port: 587,
      secure: true,
    },
  },
  {
    id: 'telia',
    name: 'Telia',
    type: 'imap',
    icon: '📧',
    authMethod: 'imap',
    domains: ['telia.com'],
    imapDefaults: {
      host: 'mail.telia.com',
      port: 993,
      secure: true,
    },
    smtpDefaults: {
      host: 'smtp.telia.com',
      port: 465,
      secure: true,
    },
  },
  {
    id: 'bredband',
    name: 'Bredband.net',
    type: 'imap',
    icon: '📧',
    authMethod: 'imap',
    domains: ['bredband.net'],
    imapDefaults: {
      host: 'imap.bredband.net',
      port: 993,
      secure: true,
    },
    smtpDefaults: {
      host: 'smtp.bredband.net',
      port: 587,
      secure: true,
    },
  },
  {
    id: 'generic-imap',
    name: 'Custom Email',
    type: 'imap',
    icon: '📧',
    authMethod: 'imap',
    domains: [], // Fallback for unknown domains
  },
];

/**
 * Create a map of domain -> provider for fast lookup
 */
const domainMap: Map<string, EmailProviderConfig> = new Map();
PROVIDERS.forEach((provider) => {
  provider.domains.forEach((domain) => {
    domainMap.set(domain.toLowerCase(), provider);
  });
});

/**
 * Detect provider from email address
 * Extracts domain and looks up provider config
 * Falls back to generic IMAP for unknown domains
 */
export function detectProvider(email: string): EmailProviderConfig {
  const domain = email.split('@')[1]?.toLowerCase();

  if (!domain) {
    // Return generic IMAP fallback
    return PROVIDERS.find((p) => p.id === 'generic-imap') || PROVIDERS[PROVIDERS.length - 1];
  }

  // Exact domain match
  const provider = domainMap.get(domain);
  if (provider) {
    return provider;
  }

  // Return generic IMAP fallback for unknown domains
  return PROVIDERS.find((p) => p.id === 'generic-imap') || PROVIDERS[PROVIDERS.length - 1];
}

/**
 * Get provider by type
 */
export function getProviderByType(type: ProviderType): EmailProviderConfig | undefined {
  return PROVIDERS.find((p) => p.type === type);
}

/**
 * Get all providers (for UI display)
 */
export function getAllProviders(): EmailProviderConfig[] {
  return PROVIDERS.filter((p) => p.id !== 'generic-imap'); // Exclude generic fallback from UI list
}

/**
 * Get providers that support OAuth
 */
export function getOAuthProviders(): EmailProviderConfig[] {
  return PROVIDERS.filter((p) => p.authMethod === 'oauth');
}
