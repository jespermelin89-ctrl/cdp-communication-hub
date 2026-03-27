
-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "google_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_accounts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'gmail',
    "email_address" TEXT NOT NULL,
    "display_name" TEXT,
    "access_token_encrypted" TEXT,
    "refresh_token_encrypted" TEXT,
    "token_expires_at" TIMESTAMP(3),
    "imap_host" TEXT,
    "imap_port" INTEGER,
    "imap_use_ssl" BOOLEAN NOT NULL DEFAULT true,
    "smtp_host" TEXT,
    "smtp_port" INTEGER,
    "smtp_use_ssl" BOOLEAN NOT NULL DEFAULT true,
    "imap_password_encrypted" TEXT,
    "signature" TEXT,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "label" TEXT,
    "color" TEXT,
    "badges" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_sync_at" TIMESTAMP(3),
    "sync_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_threads" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "gmail_thread_id" TEXT NOT NULL,
    "subject" TEXT,
    "snippet" TEXT,
    "last_message_at" TIMESTAMP(3),
    "participant_emails" TEXT[],
    "message_count" INTEGER NOT NULL DEFAULT 0,
    "labels" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "is_read" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_threads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_messages" (
    "id" TEXT NOT NULL,
    "thread_id" TEXT NOT NULL,
    "gmail_message_id" TEXT NOT NULL,
    "from_address" TEXT NOT NULL,
    "to_addresses" TEXT[],
    "cc_addresses" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "subject" TEXT,
    "body_text" TEXT,
    "body_html" TEXT,
    "received_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_analyses" (
    "id" TEXT NOT NULL,
    "thread_id" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "classification" TEXT NOT NULL,
    "priority" TEXT NOT NULL,
    "suggested_action" TEXT NOT NULL,
    "draft_text" TEXT,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "model_used" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drafts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "thread_id" TEXT,
    "to_addresses" TEXT[],
    "cc_addresses" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "subject" TEXT NOT NULL,
    "body_text" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "gmail_message_id" TEXT,
    "approved_at" TIMESTAMP(3),
    "sent_at" TIMESTAMP(3),
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "drafts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "action_logs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "action_type" TEXT NOT NULL,
    "target_type" TEXT,
    "target_id" TEXT,
    "metadata" JSONB DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "action_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "color" TEXT,
    "icon" TEXT,
    "description" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sender_rules" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "sender_pattern" TEXT NOT NULL,
    "subject_pattern" TEXT,
    "action" TEXT NOT NULL,
    "category_id" TEXT,
    "priority" TEXT,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "times_applied" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sender_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "writing_modes" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "mode_key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "characteristics" JSONB NOT NULL DEFAULT '{}',
    "example_phrases" TEXT[],
    "sign_off" TEXT,
    "opener_style" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "writing_modes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "voice_attributes" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "attribute" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "description" TEXT,
    "examples" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "voice_attributes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact_profiles" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "email_address" TEXT NOT NULL,
    "display_name" TEXT,
    "relationship" TEXT,
    "preferred_mode" TEXT,
    "language" TEXT,
    "notes" TEXT,
    "last_contact_at" TIMESTAMP(3),
    "total_emails" INTEGER NOT NULL DEFAULT 0,
    "response_rate" DOUBLE PRECISION,
    "avg_response_time" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contact_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "classification_rules" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "category_key" TEXT NOT NULL,
    "category_name" TEXT NOT NULL,
    "description" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "action" TEXT NOT NULL,
    "sender_patterns" TEXT[],
    "subject_patterns" TEXT[],
    "body_patterns" TEXT[],
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "times_matched" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "classification_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "learning_events" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "source_type" TEXT,
    "source_id" TEXT,
    "data" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "learning_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_summaries" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "needs_reply" JSONB NOT NULL DEFAULT '[]',
    "good_to_know" JSONB NOT NULL DEFAULT '[]',
    "auto_archived" JSONB NOT NULL DEFAULT '[]',
    "awaiting_reply" JSONB NOT NULL DEFAULT '[]',
    "recommendation" TEXT,
    "total_new" INTEGER NOT NULL DEFAULT 0,
    "total_unread" INTEGER NOT NULL DEFAULT 0,
    "total_auto_sorted" INTEGER NOT NULL DEFAULT 0,
    "model_used" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "daily_summaries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_settings" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "default_account_id" TEXT,
    "ui_theme" TEXT NOT NULL DEFAULT 'light',
    "notification_preferences" JSONB NOT NULL DEFAULT '{}',
    "ai_tone_preference" TEXT,

    CONSTRAINT "user_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_google_id_key" ON "users"("google_id");

-- CreateIndex
CREATE UNIQUE INDEX "email_accounts_user_id_email_address_key" ON "email_accounts"("user_id", "email_address");

-- CreateIndex
CREATE INDEX "idx_threads_account_last_msg" ON "email_threads"("account_id", "last_message_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "email_threads_account_id_gmail_thread_id_key" ON "email_threads"("account_id", "gmail_thread_id");

-- CreateIndex
CREATE UNIQUE INDEX "email_messages_thread_id_gmail_message_id_key" ON "email_messages"("thread_id", "gmail_message_id");

-- CreateIndex
CREATE INDEX "idx_ai_thread" ON "ai_analyses"("thread_id");

-- CreateIndex
CREATE INDEX "idx_drafts_status" ON "drafts"("status");

-- CreateIndex
CREATE INDEX "idx_drafts_account" ON "drafts"("account_id");

-- CreateIndex
CREATE INDEX "idx_action_logs_user" ON "action_logs"("user_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "categories_user_id_slug_key" ON "categories"("user_id", "slug");

-- CreateIndex
CREATE INDEX "idx_sender_rules_pattern" ON "sender_rules"("user_id", "sender_pattern");

-- CreateIndex
CREATE UNIQUE INDEX "writing_modes_user_id_mode_key_key" ON "writing_modes"("user_id", "mode_key");

-- CreateIndex
CREATE UNIQUE INDEX "voice_attributes_user_id_attribute_key" ON "voice_attributes"("user_id", "attribute");

-- CreateIndex
CREATE UNIQUE INDEX "contact_profiles_user_id_email_address_key" ON "contact_profiles"("user_id", "email_address");

-- CreateIndex
CREATE UNIQUE INDEX "classification_rules_user_id_category_key_key" ON "classification_rules"("user_id", "category_key");

-- CreateIndex
CREATE INDEX "idx_learning_events" ON "learning_events"("user_id", "event_type", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "daily_summaries_user_id_date_key" ON "daily_summaries"("user_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "user_settings_user_id_key" ON "user_settings"("user_id");

-- AddForeignKey
ALTER TABLE "email_accounts" ADD CONSTRAINT "email_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_threads" ADD CONSTRAINT "email_threads_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "email_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "email_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_analyses" ADD CONSTRAINT "ai_analyses_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "email_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drafts" ADD CONSTRAINT "drafts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drafts" ADD CONSTRAINT "drafts_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "email_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drafts" ADD CONSTRAINT "drafts_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "email_threads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "action_logs" ADD CONSTRAINT "action_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sender_rules" ADD CONSTRAINT "sender_rules_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

