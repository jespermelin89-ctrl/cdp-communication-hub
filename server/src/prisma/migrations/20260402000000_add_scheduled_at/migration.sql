-- Sprint 2: Scheduled Send — add scheduled_at to drafts
ALTER TABLE "drafts" ADD COLUMN IF NOT EXISTS "scheduled_at" TIMESTAMP(3);
