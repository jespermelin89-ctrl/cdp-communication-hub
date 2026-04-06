-- Sprint 4: Add rule_suggestions table for auto-learning feature
-- Safe to re-run: uses IF NOT EXISTS throughout

CREATE TABLE IF NOT EXISTS "rule_suggestions" (
    "id"               TEXT NOT NULL,
    "user_id"          TEXT NOT NULL,
    "sender_pattern"   TEXT NOT NULL,
    "suggested_action" TEXT NOT NULL,
    "trigger_count"    INTEGER NOT NULL,
    "status"           TEXT NOT NULL DEFAULT 'pending',
    "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rule_suggestions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "rule_suggestions_user_id_sender_pattern_key"
    ON "rule_suggestions"("user_id", "sender_pattern");

CREATE INDEX IF NOT EXISTS "rule_suggestions_user_id_status_idx"
    ON "rule_suggestions"("user_id", "status");
