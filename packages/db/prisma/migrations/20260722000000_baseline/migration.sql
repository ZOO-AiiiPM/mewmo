-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "AiMessageRole" AS ENUM ('user', 'assistant', 'tool');

-- CreateEnum
CREATE TYPE "AiMessageStatus" AS ENUM ('pending', 'completed', 'failed', 'cancelled');

-- CreateEnum
CREATE TYPE "AiActionRiskLevel" AS ENUM ('write', 'destructive');

-- CreateEnum
CREATE TYPE "AiActionExecutionMode" AS ENUM ('server', 'client');

-- CreateEnum
CREATE TYPE "AiActionStatus" AS ENUM ('proposed', 'confirmed', 'executing', 'succeeded', 'failed', 'cancelled');

-- CreateEnum
CREATE TYPE "AiRunKind" AS ENUM ('summary', 'embedding', 'relation', 'note_insight', 'agent_automation');

-- CreateEnum
CREATE TYPE "AiTurnStatus" AS ENUM ('running', 'succeeded', 'failed', 'interrupted');

-- CreateEnum
CREATE TYPE "AiRunStatus" AS ENUM ('queued', 'running', 'succeeded', 'failed', 'superseded');

-- CreateEnum
CREATE TYPE "AiTargetType" AS ENUM ('note', 'clip', 'feed_entry', 'automation');

-- CreateEnum
CREATE TYPE "NoteInsightKind" AS ENUM ('completeness', 'duplicate_viewpoint', 'viewpoint_change');

-- CreateEnum
CREATE TYPE "AiContextTargetType" AS ENUM ('note', 'clip', 'feed_entry');

-- CreateEnum
CREATE TYPE "TaggableType" AS ENUM ('note', 'clip', 'feed_entry');

-- CreateEnum
CREATE TYPE "FeedType" AS ENUM ('article', 'media', 'video', 'podcast');

-- CreateEnum
CREATE TYPE "KnowledgeItemKind" AS ENUM ('note', 'clip', 'feed_entry', 'asset');

-- CreateEnum
CREATE TYPE "KnowledgeAssetType" AS ENUM ('pdf', 'ebook');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "email_verified" TIMESTAMP(3),
    "name" TEXT,
    "password" TEXT,
    "avatar_url" TEXT,
    "image" TEXT,
    "provider" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_account_id" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "session_token" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_tokens" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "authenticators" (
    "credential_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "provider_account_id" TEXT NOT NULL,
    "credential_public_key" TEXT NOT NULL,
    "counter" INTEGER NOT NULL,
    "credential_device_type" TEXT NOT NULL,
    "credential_backed_up" BOOLEAN NOT NULL,
    "transports" TEXT,

    CONSTRAINT "authenticators_pkey" PRIMARY KEY ("user_id","credential_id")
);

-- CreateTable
CREATE TABLE "notes" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "summary" TEXT,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "note_shares" (
    "id" TEXT NOT NULL,
    "note_id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "note_shares_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clips" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "normalized_url" TEXT,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "summary" TEXT,
    "favicon" TEXT,
    "cover_image" TEXT,
    "excerpt" TEXT,
    "source_name" TEXT,
    "author" TEXT,
    "published_at" TIMESTAMP(3),
    "fetch_status" TEXT NOT NULL DEFAULT 'idle',
    "fetch_error" TEXT,
    "fetch_started_at" TIMESTAMP(3),
    "fetched_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "clips_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feeds" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "type" "FeedType" NOT NULL DEFAULT 'article',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "favicon" TEXT,
    "refresh_interval" INTEGER NOT NULL DEFAULT 3600,
    "last_fetch_started_at" TIMESTAMP(3),
    "last_fetch_status" TEXT NOT NULL DEFAULT 'idle',
    "last_fetch_error" TEXT,
    "last_fetch_count" INTEGER NOT NULL DEFAULT 0,
    "last_fetched_at" TIMESTAMP(3),
    "last_seen_entry_url" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "feeds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feed_entries" (
    "id" TEXT NOT NULL,
    "feed_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "summary" TEXT,
    "cover_image" TEXT,
    "excerpt" TEXT,
    "source_name" TEXT,
    "author" TEXT,
    "published_at" TIMESTAMP(3),
    "read_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "feed_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_chats" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "active_leaf_id" TEXT,
    "next_entry_seq" INTEGER NOT NULL DEFAULT 1,
    "parent_chat_id" TEXT,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "ai_chats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_messages" (
    "id" TEXT NOT NULL,
    "chat_id" TEXT NOT NULL,
    "client_request_id" TEXT,
    "role" "AiMessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "status" "AiMessageStatus" NOT NULL DEFAULT 'completed',
    "metadata" JSONB,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "ai_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_context_attachments" (
    "id" TEXT NOT NULL,
    "message_id" TEXT,
    "session_entry_id" TEXT,
    "target_type" "AiContextTargetType" NOT NULL,
    "target_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "source_url" TEXT,
    "summary_snapshot" TEXT,
    "content_snapshot" TEXT,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_context_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_actions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "chat_id" TEXT,
    "turn_id" TEXT,
    "tool_call_id" TEXT,
    "tool_name" TEXT NOT NULL,
    "input" JSONB NOT NULL,
    "preview" JSONB NOT NULL,
    "risk_level" "AiActionRiskLevel" NOT NULL DEFAULT 'write',
    "execution_mode" "AiActionExecutionMode" NOT NULL DEFAULT 'server',
    "client_effect" JSONB,
    "status" "AiActionStatus" NOT NULL DEFAULT 'proposed',
    "expected_version" INTEGER,
    "idempotency_key" TEXT NOT NULL,
    "result" JSONB,
    "error_code" TEXT,
    "error_message" TEXT,
    "confirmed_at" TIMESTAMP(3),
    "execution_started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_runs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "kind" "AiRunKind" NOT NULL,
    "target_type" "AiTargetType" NOT NULL,
    "target_id" TEXT NOT NULL,
    "automation_id" TEXT,
    "input_version" INTEGER NOT NULL,
    "input_hash" TEXT,
    "idempotency_key" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "status" "AiRunStatus" NOT NULL DEFAULT 'queued',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "available_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "worker_id" TEXT,
    "lease_expires_at" TIMESTAMP(3),
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "output" JSONB,
    "error_code" TEXT,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_session_entries" (
    "id" TEXT NOT NULL,
    "chat_id" TEXT NOT NULL,
    "entry_id" TEXT NOT NULL,
    "entry_seq" INTEGER NOT NULL,
    "parent_id" TEXT,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_session_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_turns" (
    "id" TEXT NOT NULL,
    "chat_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "client_request_id" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "status" "AiTurnStatus" NOT NULL DEFAULT 'running',
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "worker_id" TEXT,
    "lease_expires_at" TIMESTAMP(3),
    "user_entry_id" TEXT,
    "assistant_entry_id" TEXT,
    "output" JSONB,
    "error_code" TEXT,
    "error_message" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_turns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_usage_events" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "chat_id" TEXT,
    "turn_id" TEXT,
    "run_id" TEXT,
    "entry_id" TEXT,
    "purpose" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "requested_model" TEXT NOT NULL,
    "response_model" TEXT,
    "input_tokens" INTEGER NOT NULL DEFAULT 0,
    "output_tokens" INTEGER NOT NULL DEFAULT 0,
    "reasoning_tokens" INTEGER,
    "cache_read_tokens" INTEGER NOT NULL DEFAULT 0,
    "cache_write_tokens" INTEGER NOT NULL DEFAULT 0,
    "provider_cost_usd" DECIMAL(18,8),
    "product_credits" DECIMAL(18,8),
    "price_snapshot" JSONB,
    "idempotency_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_usage_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_skills" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "model_purpose" TEXT NOT NULL DEFAULT 'agent.chat',
    "allowed_tools" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_skills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_automations" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "chat_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "skill_name" TEXT,
    "cron_expression" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "next_run_at" TIMESTAMP(3) NOT NULL,
    "last_enqueued_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_automations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_embeddings" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "target_type" "AiTargetType" NOT NULL,
    "target_id" TEXT NOT NULL,
    "input_version" INTEGER NOT NULL,
    "model" TEXT NOT NULL,
    "dimensions" INTEGER NOT NULL,
    "embedding" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "content_embeddings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_relations" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "source_type" "AiTargetType" NOT NULL,
    "source_id" TEXT NOT NULL,
    "source_version" INTEGER NOT NULL,
    "target_type" "AiTargetType" NOT NULL,
    "target_id" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "content_relations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "note_insights" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "note_id" TEXT NOT NULL,
    "input_version" INTEGER NOT NULL,
    "kind" "NoteInsightKind" NOT NULL,
    "content" TEXT NOT NULL,
    "data" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "note_insights_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tags" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "user_id" TEXT NOT NULL,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "taggables" (
    "id" TEXT NOT NULL,
    "tag_id" TEXT NOT NULL,
    "taggable_id" TEXT NOT NULL,
    "taggable_type" "TaggableType" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "taggables_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tag_pool" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tag_pool_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_cursors" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "device_id" TEXT NOT NULL,
    "last_version" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sync_cursors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_bases" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "icon" TEXT NOT NULL DEFAULT 'book',
    "position" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "knowledge_bases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_folders" (
    "id" TEXT NOT NULL,
    "knowledge_base_id" TEXT NOT NULL,
    "parent_id" TEXT,
    "name" TEXT NOT NULL,
    "depth" INTEGER NOT NULL DEFAULT 0,
    "position" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "knowledge_folders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_items" (
    "id" TEXT NOT NULL,
    "knowledge_base_id" TEXT NOT NULL,
    "folder_id" TEXT,
    "kind" "KnowledgeItemKind" NOT NULL,
    "note_id" TEXT,
    "clip_id" TEXT,
    "feed_entry_id" TEXT,
    "asset_type" "KnowledgeAssetType",
    "title" TEXT,
    "summary" TEXT,
    "source_name" TEXT,
    "source_url" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "knowledge_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "accounts_user_id_idx" ON "accounts"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_provider_provider_account_id_key" ON "accounts"("provider", "provider_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_session_token_key" ON "sessions"("session_token");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "verification_tokens_token_key" ON "verification_tokens"("token");

-- CreateIndex
CREATE UNIQUE INDEX "verification_tokens_identifier_token_key" ON "verification_tokens"("identifier", "token");

-- CreateIndex
CREATE UNIQUE INDEX "authenticators_credential_id_key" ON "authenticators"("credential_id");

-- CreateIndex
CREATE INDEX "notes_user_id_deleted_at_updated_at_idx" ON "notes"("user_id", "deleted_at", "updated_at");

-- CreateIndex
CREATE UNIQUE INDEX "notes_user_id_slug_key" ON "notes"("user_id", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "note_shares_token_key" ON "note_shares"("token");

-- CreateIndex
CREATE INDEX "note_shares_note_id_revoked_at_idx" ON "note_shares"("note_id", "revoked_at");

-- CreateIndex
CREATE INDEX "note_shares_owner_id_revoked_at_idx" ON "note_shares"("owner_id", "revoked_at");

-- CreateIndex
CREATE INDEX "clips_user_id_deleted_at_updated_at_idx" ON "clips"("user_id", "deleted_at", "updated_at");

-- CreateIndex
CREATE UNIQUE INDEX "clips_user_id_normalized_url_key" ON "clips"("user_id", "normalized_url");

-- CreateIndex
CREATE INDEX "feeds_user_id_deleted_at_last_fetched_at_idx" ON "feeds"("user_id", "deleted_at", "last_fetched_at");

-- CreateIndex
CREATE UNIQUE INDEX "feeds_user_id_url_type_key" ON "feeds"("user_id", "url", "type");

-- CreateIndex
CREATE INDEX "feed_entries_feed_id_deleted_at_published_at_idx" ON "feed_entries"("feed_id", "deleted_at", "published_at");

-- CreateIndex
CREATE INDEX "feed_entries_user_id_deleted_at_read_at_idx" ON "feed_entries"("user_id", "deleted_at", "read_at");

-- CreateIndex
CREATE UNIQUE INDEX "feed_entries_feed_id_url_key" ON "feed_entries"("feed_id", "url");

-- CreateIndex
CREATE INDEX "ai_chats_user_id_deleted_at_updated_at_idx" ON "ai_chats"("user_id", "deleted_at", "updated_at");

-- CreateIndex
CREATE INDEX "ai_chats_parent_chat_id_idx" ON "ai_chats"("parent_chat_id");

-- CreateIndex
CREATE INDEX "ai_messages_chat_id_deleted_at_created_at_idx" ON "ai_messages"("chat_id", "deleted_at", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "ai_messages_chat_id_client_request_id_role_key" ON "ai_messages"("chat_id", "client_request_id", "role");

-- CreateIndex
CREATE INDEX "ai_context_attachments_message_id_idx" ON "ai_context_attachments"("message_id");

-- CreateIndex
CREATE INDEX "ai_context_attachments_session_entry_id_idx" ON "ai_context_attachments"("session_entry_id");

-- CreateIndex
CREATE INDEX "ai_context_attachments_target_type_target_id_idx" ON "ai_context_attachments"("target_type", "target_id");

-- CreateIndex
CREATE INDEX "ai_context_attachments_user_id_created_at_idx" ON "ai_context_attachments"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "ai_actions_chat_id_created_at_idx" ON "ai_actions"("chat_id", "created_at");

-- CreateIndex
CREATE INDEX "ai_actions_user_id_status_created_at_idx" ON "ai_actions"("user_id", "status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "ai_actions_user_id_idempotency_key_key" ON "ai_actions"("user_id", "idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "ai_actions_turn_id_tool_call_id_key" ON "ai_actions"("turn_id", "tool_call_id");

-- CreateIndex
CREATE INDEX "ai_runs_status_available_at_priority_created_at_idx" ON "ai_runs"("status", "available_at", "priority", "created_at");

-- CreateIndex
CREATE INDEX "ai_runs_user_id_target_type_target_id_created_at_idx" ON "ai_runs"("user_id", "target_type", "target_id", "created_at");

-- CreateIndex
CREATE INDEX "ai_runs_worker_id_lease_expires_at_idx" ON "ai_runs"("worker_id", "lease_expires_at");

-- CreateIndex
CREATE INDEX "ai_runs_automation_id_created_at_idx" ON "ai_runs"("automation_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "ai_runs_user_id_idempotency_key_key" ON "ai_runs"("user_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "ai_session_entries_chat_id_type_entry_seq_idx" ON "ai_session_entries"("chat_id", "type", "entry_seq");

-- CreateIndex
CREATE INDEX "ai_session_entries_chat_id_parent_id_idx" ON "ai_session_entries"("chat_id", "parent_id");

-- CreateIndex
CREATE UNIQUE INDEX "ai_session_entries_chat_id_entry_id_key" ON "ai_session_entries"("chat_id", "entry_id");

-- CreateIndex
CREATE UNIQUE INDEX "ai_session_entries_chat_id_entry_seq_key" ON "ai_session_entries"("chat_id", "entry_seq");

-- CreateIndex
CREATE INDEX "ai_turns_user_id_status_created_at_idx" ON "ai_turns"("user_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "ai_turns_worker_id_lease_expires_at_idx" ON "ai_turns"("worker_id", "lease_expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "ai_turns_chat_id_client_request_id_key" ON "ai_turns"("chat_id", "client_request_id");

-- CreateIndex
CREATE INDEX "ai_usage_events_chat_id_created_at_idx" ON "ai_usage_events"("chat_id", "created_at");

-- CreateIndex
CREATE INDEX "ai_usage_events_turn_id_created_at_idx" ON "ai_usage_events"("turn_id", "created_at");

-- CreateIndex
CREATE INDEX "ai_usage_events_run_id_created_at_idx" ON "ai_usage_events"("run_id", "created_at");

-- CreateIndex
CREATE INDEX "ai_usage_events_user_id_purpose_created_at_idx" ON "ai_usage_events"("user_id", "purpose", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "ai_usage_events_user_id_idempotency_key_key" ON "ai_usage_events"("user_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "ai_skills_user_id_enabled_updated_at_idx" ON "ai_skills"("user_id", "enabled", "updated_at");

-- CreateIndex
CREATE UNIQUE INDEX "ai_skills_user_id_name_key" ON "ai_skills"("user_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "ai_automations_chat_id_key" ON "ai_automations"("chat_id");

-- CreateIndex
CREATE INDEX "ai_automations_enabled_next_run_at_idx" ON "ai_automations"("enabled", "next_run_at");

-- CreateIndex
CREATE INDEX "ai_automations_user_id_enabled_updated_at_idx" ON "ai_automations"("user_id", "enabled", "updated_at");

-- CreateIndex
CREATE INDEX "content_embeddings_user_id_target_type_input_version_idx" ON "content_embeddings"("user_id", "target_type", "input_version");

-- CreateIndex
CREATE UNIQUE INDEX "content_embeddings_user_id_target_type_target_id_key" ON "content_embeddings"("user_id", "target_type", "target_id");

-- CreateIndex
CREATE INDEX "content_relations_user_id_source_type_source_id_score_idx" ON "content_relations"("user_id", "source_type", "source_id", "score");

-- CreateIndex
CREATE INDEX "content_relations_user_id_target_type_target_id_idx" ON "content_relations"("user_id", "target_type", "target_id");

-- CreateIndex
CREATE UNIQUE INDEX "content_relations_user_id_source_type_source_id_target_type_key" ON "content_relations"("user_id", "source_type", "source_id", "target_type", "target_id");

-- CreateIndex
CREATE INDEX "note_insights_user_id_note_id_input_version_idx" ON "note_insights"("user_id", "note_id", "input_version");

-- CreateIndex
CREATE UNIQUE INDEX "note_insights_user_id_note_id_kind_key" ON "note_insights"("user_id", "note_id", "kind");

-- CreateIndex
CREATE INDEX "tags_user_id_deleted_at_idx" ON "tags"("user_id", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "tags_user_id_name_key" ON "tags"("user_id", "name");

-- CreateIndex
CREATE INDEX "taggables_taggable_id_taggable_type_idx" ON "taggables"("taggable_id", "taggable_type");

-- CreateIndex
CREATE UNIQUE INDEX "taggables_tag_id_taggable_id_taggable_type_key" ON "taggables"("tag_id", "taggable_id", "taggable_type");

-- CreateIndex
CREATE UNIQUE INDEX "tag_pool_user_id_name_key" ON "tag_pool"("user_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "sync_cursors_user_id_device_id_key" ON "sync_cursors"("user_id", "device_id");

-- CreateIndex
CREATE INDEX "knowledge_bases_user_id_deleted_at_position_idx" ON "knowledge_bases"("user_id", "deleted_at", "position");

-- CreateIndex
CREATE INDEX "knowledge_folders_knowledge_base_id_parent_id_deleted_at_po_idx" ON "knowledge_folders"("knowledge_base_id", "parent_id", "deleted_at", "position");

-- CreateIndex
CREATE INDEX "knowledge_folders_user_id_deleted_at_idx" ON "knowledge_folders"("user_id", "deleted_at");

-- CreateIndex
CREATE INDEX "knowledge_items_knowledge_base_id_folder_id_deleted_at_posi_idx" ON "knowledge_items"("knowledge_base_id", "folder_id", "deleted_at", "position");

-- CreateIndex
CREATE INDEX "knowledge_items_user_id_deleted_at_idx" ON "knowledge_items"("user_id", "deleted_at");

-- CreateIndex
CREATE INDEX "knowledge_items_note_id_idx" ON "knowledge_items"("note_id");

-- CreateIndex
CREATE INDEX "knowledge_items_clip_id_idx" ON "knowledge_items"("clip_id");

-- CreateIndex
CREATE INDEX "knowledge_items_feed_entry_id_idx" ON "knowledge_items"("feed_entry_id");

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "authenticators" ADD CONSTRAINT "authenticators_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "notes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "note_shares" ADD CONSTRAINT "note_shares_note_id_fkey" FOREIGN KEY ("note_id") REFERENCES "notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "note_shares" ADD CONSTRAINT "note_shares_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clips" ADD CONSTRAINT "clips_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feeds" ADD CONSTRAINT "feeds_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feed_entries" ADD CONSTRAINT "feed_entries_feed_id_fkey" FOREIGN KEY ("feed_id") REFERENCES "feeds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feed_entries" ADD CONSTRAINT "feed_entries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_chats" ADD CONSTRAINT "ai_chats_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_chats" ADD CONSTRAINT "ai_chats_parent_chat_id_fkey" FOREIGN KEY ("parent_chat_id") REFERENCES "ai_chats"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_messages" ADD CONSTRAINT "ai_messages_chat_id_fkey" FOREIGN KEY ("chat_id") REFERENCES "ai_chats"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_context_attachments" ADD CONSTRAINT "ai_context_attachments_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "ai_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_context_attachments" ADD CONSTRAINT "ai_context_attachments_session_entry_id_fkey" FOREIGN KEY ("session_entry_id") REFERENCES "ai_session_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_context_attachments" ADD CONSTRAINT "ai_context_attachments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_actions" ADD CONSTRAINT "ai_actions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_actions" ADD CONSTRAINT "ai_actions_chat_id_fkey" FOREIGN KEY ("chat_id") REFERENCES "ai_chats"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_actions" ADD CONSTRAINT "ai_actions_turn_id_fkey" FOREIGN KEY ("turn_id") REFERENCES "ai_turns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_runs" ADD CONSTRAINT "ai_runs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_runs" ADD CONSTRAINT "ai_runs_automation_id_fkey" FOREIGN KEY ("automation_id") REFERENCES "ai_automations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_session_entries" ADD CONSTRAINT "ai_session_entries_chat_id_fkey" FOREIGN KEY ("chat_id") REFERENCES "ai_chats"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_turns" ADD CONSTRAINT "ai_turns_chat_id_fkey" FOREIGN KEY ("chat_id") REFERENCES "ai_chats"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_turns" ADD CONSTRAINT "ai_turns_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_usage_events" ADD CONSTRAINT "ai_usage_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_usage_events" ADD CONSTRAINT "ai_usage_events_chat_id_fkey" FOREIGN KEY ("chat_id") REFERENCES "ai_chats"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_usage_events" ADD CONSTRAINT "ai_usage_events_turn_id_fkey" FOREIGN KEY ("turn_id") REFERENCES "ai_turns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_usage_events" ADD CONSTRAINT "ai_usage_events_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "ai_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_skills" ADD CONSTRAINT "ai_skills_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_automations" ADD CONSTRAINT "ai_automations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_automations" ADD CONSTRAINT "ai_automations_chat_id_fkey" FOREIGN KEY ("chat_id") REFERENCES "ai_chats"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_embeddings" ADD CONSTRAINT "content_embeddings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_relations" ADD CONSTRAINT "content_relations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "note_insights" ADD CONSTRAINT "note_insights_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tags" ADD CONSTRAINT "tags_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "taggables" ADD CONSTRAINT "taggables_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tag_pool" ADD CONSTRAINT "tag_pool_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_cursors" ADD CONSTRAINT "sync_cursors_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_bases" ADD CONSTRAINT "knowledge_bases_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_folders" ADD CONSTRAINT "knowledge_folders_knowledge_base_id_fkey" FOREIGN KEY ("knowledge_base_id") REFERENCES "knowledge_bases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_folders" ADD CONSTRAINT "knowledge_folders_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "knowledge_folders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_folders" ADD CONSTRAINT "knowledge_folders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_items" ADD CONSTRAINT "knowledge_items_knowledge_base_id_fkey" FOREIGN KEY ("knowledge_base_id") REFERENCES "knowledge_bases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_items" ADD CONSTRAINT "knowledge_items_folder_id_fkey" FOREIGN KEY ("folder_id") REFERENCES "knowledge_folders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_items" ADD CONSTRAINT "knowledge_items_note_id_fkey" FOREIGN KEY ("note_id") REFERENCES "notes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_items" ADD CONSTRAINT "knowledge_items_clip_id_fkey" FOREIGN KEY ("clip_id") REFERENCES "clips"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_items" ADD CONSTRAINT "knowledge_items_feed_entry_id_fkey" FOREIGN KEY ("feed_entry_id") REFERENCES "feed_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_items" ADD CONSTRAINT "knowledge_items_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

