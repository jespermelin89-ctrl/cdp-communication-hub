-- Sprint 5: Add source column to drafts table
-- Distinguishes auto-generated triage drafts from manual drafts.
-- Safe to re-run: uses IF NOT EXISTS / ADD COLUMN IF NOT EXISTS pattern.

ALTER TABLE "drafts"
  ADD COLUMN IF NOT EXISTS "source" TEXT DEFAULT 'manual';
