import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().default(3001),
  HOST: z.string().default('0.0.0.0'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  DATABASE_URL: z.string().min(1),

  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  GOOGLE_REDIRECT_URI: z.string().url(),

  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('7d'),

  ENCRYPTION_KEY: z.string().min(32),

  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  GROQ_API_KEY: z.string().optional(),
  AI_PROVIDER: z.enum(['anthropic', 'openai', 'groq']).default('groq'),

  FRONTEND_URL: z.string().url().default('http://localhost:3000'),

  // External API key for Apple Shortcuts / Siri integration
  COMMAND_API_KEY: z.string().optional(),

  // Google Cloud — Pub/Sub push integration
  GOOGLE_CLOUD_PROJECT_ID: z.string().optional(),
  // Override the full topic name (defaults to projects/{GOOGLE_CLOUD_PROJECT_ID}/topics/cdp-hub-gmail)
  GMAIL_PUBSUB_TOPIC: z.string().optional(),
  // Public URL Google will push to (e.g. https://cdp-hub-api.onrender.com/api/v1/webhooks/gmail)
  GMAIL_PUSH_WEBHOOK_URL: z.string().url().optional(),
  // Verification bearer token set on the Pub/Sub push subscription
  GOOGLE_PUBSUB_VERIFICATION_TOKEN: z.string().optional(),

  // Brain Core integration — outbound webhooks
  BRAIN_CORE_WEBHOOK_URL: z.string().url().optional(),
  BRAIN_CORE_WEBHOOK_SECRET: z.string().optional(),
  BRAIN_CORE_ORGANIZATION_ID: z.string().optional(),

  // Web Push (VAPID)
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().optional().default('mailto:jesper.melin89@gmail.com'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:');
  console.error(parsed.error.format());
  process.exit(1);
}

// Warn if no AI provider is configured (AI features will be unavailable)
if (!parsed.data.ANTHROPIC_API_KEY && !parsed.data.OPENAI_API_KEY && !parsed.data.GROQ_API_KEY) {
  console.warn('⚠️  No AI provider configured. AI features (analysis, draft generation) will be unavailable.');
  console.warn('   Set GROQ_API_KEY, ANTHROPIC_API_KEY, or OPENAI_API_KEY to enable AI features.');
}

export const env = parsed.data;
