/**
 * env-check.ts — Explicit startup validation of required and optional env vars.
 *
 * Required vars cause process.exit(1) if missing.
 * Optional vars emit a warning — features that depend on them will be degraded.
 *
 * Note: Core validation (Zod schema) already runs in config/env.ts.
 * This function adds a human-readable startup summary.
 */

const REQUIRED_VARS = [
  'DATABASE_URL',
  'JWT_SECRET',
  'ENCRYPTION_KEY',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'GOOGLE_REDIRECT_URI',
  'FRONTEND_URL',
];

const OPTIONAL_VARS = [
  'VAPID_PUBLIC_KEY',
  'VAPID_PRIVATE_KEY',
  'GROQ_API_KEY',
  'ANTHROPIC_API_KEY',
  'OPENAI_API_KEY',
  'COMMAND_API_KEY',
];

export function validateEnv(): void {
  const missing = REQUIRED_VARS.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    console.error(`\n❌ FATAL: Missing required environment variables:\n   ${missing.join(', ')}\n`);
    process.exit(1);
  }

  const missingOptional = OPTIONAL_VARS.filter((k) => !process.env[k]);
  if (missingOptional.length > 0) {
    console.warn(`⚠️  Optional env vars not set (degraded features): ${missingOptional.join(', ')}`);
  }

  console.log('✅ Environment variables validated');
}
