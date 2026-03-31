ALTER TABLE "email_threads" ADD COLUMN IF NOT EXISTS "is_sent_by_user" BOOLEAN NOT NULL DEFAULT false;
