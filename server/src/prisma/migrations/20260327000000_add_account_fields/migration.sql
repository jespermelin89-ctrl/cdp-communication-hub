-- AddColumn account_type, team_members, ai_handling to email_accounts
-- These columns were added to schema.prisma but never applied to the database.

ALTER TABLE "email_accounts"
  ADD COLUMN IF NOT EXISTS "account_type" TEXT NOT NULL DEFAULT 'personal',
  ADD COLUMN IF NOT EXISTS "team_members" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS "ai_handling" TEXT NOT NULL DEFAULT 'normal';
