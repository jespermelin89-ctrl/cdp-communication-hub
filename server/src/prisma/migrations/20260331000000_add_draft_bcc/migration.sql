-- Migration: add BCC recipients to drafts
-- Safe to re-run (IF NOT EXISTS guard)

ALTER TABLE "drafts"
  ADD COLUMN IF NOT EXISTS "bcc_addresses" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
