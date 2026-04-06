-- Sprint 1 (Smart Triage): Add triage_log table
-- Records every action taken by the action executor.
-- 30-day retention enforced by nightly cron (Sprint 7).

CREATE TABLE IF NOT EXISTS "triage_log" (
  "id"             TEXT        NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "thread_id"      TEXT        NOT NULL,
  "account_id"     TEXT        NOT NULL,
  "user_id"        TEXT        NOT NULL,
  "action"         TEXT        NOT NULL,
  "classification" TEXT        NOT NULL,
  "priority"       TEXT        NOT NULL,
  "source"         TEXT        NOT NULL,
  "confidence"     DOUBLE PRECISION NOT NULL,
  "reason"         TEXT        NOT NULL,
  "sender_email"   TEXT        NOT NULL,
  "subject"        TEXT,
  "created_at"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "idx_triage_log_user"
  ON "triage_log"("user_id", "created_at" DESC);

CREATE INDEX IF NOT EXISTS "idx_triage_log_user_action"
  ON "triage_log"("user_id", "action", "created_at" DESC);
