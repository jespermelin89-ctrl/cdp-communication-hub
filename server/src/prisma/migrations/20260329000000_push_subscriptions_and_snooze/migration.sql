-- Migration: push_subscriptions + snoozedUntil on email_threads
-- Safe to re-run (IF NOT EXISTS guards)

-- Web Push Subscriptions
CREATE TABLE IF NOT EXISTS "push_subscriptions" (
  "id"         TEXT NOT NULL,
  "user_id"    TEXT NOT NULL,
  "endpoint"   TEXT NOT NULL,
  "p256dh"     TEXT NOT NULL,
  "auth"       TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "push_subscriptions_user_id_endpoint_key"
  ON "push_subscriptions"("user_id", "endpoint");

-- Snooze support on threads
ALTER TABLE "email_threads" ADD COLUMN IF NOT EXISTS "snoozed_until" TIMESTAMP(3);
