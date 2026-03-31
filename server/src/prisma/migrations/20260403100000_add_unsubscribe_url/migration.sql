-- Sprint 2: Add unsubscribe_url to email_messages for List-Unsubscribe header support
ALTER TABLE "email_messages" ADD COLUMN IF NOT EXISTS "unsubscribe_url" TEXT;
