-- Add attachments JSON column to email_messages
ALTER TABLE "email_messages" ADD COLUMN IF NOT EXISTS "attachments" JSONB DEFAULT '[]'::jsonb;
