-- Sprint 7: Add suggested_reply column to ai_analyses for Amanda smart reply suggestions
ALTER TABLE "ai_analyses" ADD COLUMN IF NOT EXISTS "suggested_reply" TEXT;
