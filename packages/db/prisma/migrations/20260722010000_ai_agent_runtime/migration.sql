-- Additive AI Runtime migration.
-- This migration is safe to run against an existing Neon database: it never
-- drops or renames tables, columns, enums, indexes, or constraints.

CREATE SCHEMA IF NOT EXISTS "public";

DO $$ BEGIN CREATE TYPE "AiRunKind" AS ENUM ('summary', 'embedding', 'relation', 'note_insight', 'agent_automation'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "AiTargetType" AS ENUM ('note', 'clip', 'feed_entry', 'automation'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "AiTurnStatus" AS ENUM ('running', 'succeeded', 'failed', 'interrupted'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "AiMessageRole" AS ENUM ('user', 'assistant', 'tool'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "AiMessageStatus" AS ENUM ('pending', 'completed', 'failed', 'cancelled'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "AiActionRiskLevel" AS ENUM ('write', 'destructive'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "AiActionExecutionMode" AS ENUM ('server', 'client'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "AiActionStatus" AS ENUM ('proposed', 'confirmed', 'executing', 'succeeded', 'failed', 'cancelled'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "AiRunStatus" AS ENUM ('queued', 'running', 'succeeded', 'failed', 'superseded'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "NoteInsightKind" AS ENUM ('completeness', 'duplicate_viewpoint', 'viewpoint_change'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "AiContextTargetType" AS ENUM ('note', 'clip', 'feed_entry'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid = '"AiRunKind"'::regtype AND enumlabel = 'agent_automation') THEN
    ALTER TYPE "AiRunKind" ADD VALUE 'agent_automation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid = '"AiTargetType"'::regtype AND enumlabel = 'automation') THEN
    ALTER TYPE "AiTargetType" ADD VALUE 'automation';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "ai_chats" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "active_leaf_id" TEXT,
  "next_entry_seq" INTEGER NOT NULL DEFAULT 1,
  "parent_chat_id" TEXT,
  "user_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deleted_at" TIMESTAMP(3),
  CONSTRAINT "ai_chats_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ai_messages" (
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

CREATE TABLE IF NOT EXISTS "ai_context_attachments" (
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

CREATE TABLE IF NOT EXISTS "ai_actions" (
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
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ai_actions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ai_runs" (
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
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ai_runs_pkey" PRIMARY KEY ("id")
);

-- Existing tables are upgraded in place. Nullable columns preserve legacy rows.
ALTER TABLE IF EXISTS "ai_chats"
  ADD COLUMN IF NOT EXISTS "active_leaf_id" TEXT,
  ADD COLUMN IF NOT EXISTS "next_entry_seq" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "parent_chat_id" TEXT;

ALTER TABLE IF EXISTS "ai_messages"
  ADD COLUMN IF NOT EXISTS "client_request_id" TEXT;

ALTER TABLE IF EXISTS "ai_context_attachments"
  ADD COLUMN IF NOT EXISTS "session_entry_id" TEXT,
  ALTER COLUMN "message_id" DROP NOT NULL;

ALTER TABLE IF EXISTS "ai_actions"
  ADD COLUMN IF NOT EXISTS "chat_id" TEXT,
  ADD COLUMN IF NOT EXISTS "turn_id" TEXT,
  ADD COLUMN IF NOT EXISTS "tool_call_id" TEXT;

ALTER TABLE IF EXISTS "ai_runs"
  ADD COLUMN IF NOT EXISTS "automation_id" TEXT;

CREATE TABLE IF NOT EXISTS "ai_session_entries" (
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

CREATE TABLE IF NOT EXISTS "ai_turns" (
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
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ai_turns_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ai_usage_events" (
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

CREATE TABLE IF NOT EXISTS "ai_skills" (
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
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ai_skills_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ai_automations" (
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
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ai_automations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "content_embeddings" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "target_type" "AiTargetType" NOT NULL,
  "target_id" TEXT NOT NULL,
  "input_version" INTEGER NOT NULL,
  "model" TEXT NOT NULL,
  "dimensions" INTEGER NOT NULL,
  "embedding" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "content_embeddings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "content_relations" (
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
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "content_relations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "note_insights" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "note_id" TEXT NOT NULL,
  "input_version" INTEGER NOT NULL,
  "kind" "NoteInsightKind" NOT NULL,
  "content" TEXT NOT NULL,
  "data" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "note_insights_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ai_messages_chat_id_client_request_id_role_key" ON "ai_messages"("chat_id", "client_request_id", "role");
CREATE INDEX IF NOT EXISTS "ai_chats_user_id_deleted_at_updated_at_idx" ON "ai_chats"("user_id", "deleted_at", "updated_at");
CREATE INDEX IF NOT EXISTS "ai_messages_chat_id_deleted_at_created_at_idx" ON "ai_messages"("chat_id", "deleted_at", "created_at");
CREATE INDEX IF NOT EXISTS "ai_context_attachments_message_id_idx" ON "ai_context_attachments"("message_id");
CREATE INDEX IF NOT EXISTS "ai_context_attachments_session_entry_id_idx" ON "ai_context_attachments"("session_entry_id");
CREATE INDEX IF NOT EXISTS "ai_context_attachments_target_type_target_id_idx" ON "ai_context_attachments"("target_type", "target_id");
CREATE INDEX IF NOT EXISTS "ai_context_attachments_user_id_created_at_idx" ON "ai_context_attachments"("user_id", "created_at");
CREATE UNIQUE INDEX IF NOT EXISTS "ai_actions_user_id_idempotency_key_key" ON "ai_actions"("user_id", "idempotency_key");
CREATE UNIQUE INDEX IF NOT EXISTS "ai_actions_turn_id_tool_call_id_key" ON "ai_actions"("turn_id", "tool_call_id");
CREATE INDEX IF NOT EXISTS "ai_chats_parent_chat_id_idx" ON "ai_chats"("parent_chat_id");
CREATE INDEX IF NOT EXISTS "ai_actions_chat_id_created_at_idx" ON "ai_actions"("chat_id", "created_at");
CREATE INDEX IF NOT EXISTS "ai_actions_user_id_status_created_at_idx" ON "ai_actions"("user_id", "status", "created_at");
CREATE INDEX IF NOT EXISTS "ai_runs_status_available_at_priority_created_at_idx" ON "ai_runs"("status", "available_at", "priority", "created_at");
CREATE INDEX IF NOT EXISTS "ai_runs_user_id_target_type_target_id_created_at_idx" ON "ai_runs"("user_id", "target_type", "target_id", "created_at");
CREATE INDEX IF NOT EXISTS "ai_runs_worker_id_lease_expires_at_idx" ON "ai_runs"("worker_id", "lease_expires_at");
CREATE INDEX IF NOT EXISTS "ai_runs_automation_id_created_at_idx" ON "ai_runs"("automation_id", "created_at");
CREATE UNIQUE INDEX IF NOT EXISTS "ai_session_entries_chat_id_entry_id_key" ON "ai_session_entries"("chat_id", "entry_id");
CREATE UNIQUE INDEX IF NOT EXISTS "ai_session_entries_chat_id_entry_seq_key" ON "ai_session_entries"("chat_id", "entry_seq");
CREATE INDEX IF NOT EXISTS "ai_session_entries_chat_id_type_entry_seq_idx" ON "ai_session_entries"("chat_id", "type", "entry_seq");
CREATE INDEX IF NOT EXISTS "ai_session_entries_chat_id_parent_id_idx" ON "ai_session_entries"("chat_id", "parent_id");
CREATE UNIQUE INDEX IF NOT EXISTS "ai_turns_chat_id_client_request_id_key" ON "ai_turns"("chat_id", "client_request_id");
CREATE INDEX IF NOT EXISTS "ai_turns_user_id_status_created_at_idx" ON "ai_turns"("user_id", "status", "created_at");
CREATE INDEX IF NOT EXISTS "ai_turns_worker_id_lease_expires_at_idx" ON "ai_turns"("worker_id", "lease_expires_at");
CREATE UNIQUE INDEX IF NOT EXISTS "ai_usage_events_user_id_idempotency_key_key" ON "ai_usage_events"("user_id", "idempotency_key");
CREATE INDEX IF NOT EXISTS "ai_usage_events_chat_id_created_at_idx" ON "ai_usage_events"("chat_id", "created_at");
CREATE INDEX IF NOT EXISTS "ai_usage_events_turn_id_created_at_idx" ON "ai_usage_events"("turn_id", "created_at");
CREATE INDEX IF NOT EXISTS "ai_usage_events_run_id_created_at_idx" ON "ai_usage_events"("run_id", "created_at");
CREATE INDEX IF NOT EXISTS "ai_usage_events_user_id_purpose_created_at_idx" ON "ai_usage_events"("user_id", "purpose", "created_at");
CREATE UNIQUE INDEX IF NOT EXISTS "ai_skills_user_id_name_key" ON "ai_skills"("user_id", "name");
CREATE INDEX IF NOT EXISTS "ai_skills_user_id_enabled_updated_at_idx" ON "ai_skills"("user_id", "enabled", "updated_at");
CREATE UNIQUE INDEX IF NOT EXISTS "ai_automations_chat_id_key" ON "ai_automations"("chat_id");
CREATE INDEX IF NOT EXISTS "ai_automations_enabled_next_run_at_idx" ON "ai_automations"("enabled", "next_run_at");
CREATE INDEX IF NOT EXISTS "ai_automations_user_id_enabled_updated_at_idx" ON "ai_automations"("user_id", "enabled", "updated_at");
CREATE UNIQUE INDEX IF NOT EXISTS "content_embeddings_user_id_target_type_target_id_key" ON "content_embeddings"("user_id", "target_type", "target_id");
CREATE INDEX IF NOT EXISTS "content_embeddings_user_id_target_type_input_version_idx" ON "content_embeddings"("user_id", "target_type", "input_version");
CREATE UNIQUE INDEX IF NOT EXISTS "content_relations_user_id_source_type_source_id_target_type_target_id_key" ON "content_relations"("user_id", "source_type", "source_id", "target_type", "target_id");
CREATE INDEX IF NOT EXISTS "content_relations_user_id_source_type_source_id_score_idx" ON "content_relations"("user_id", "source_type", "source_id", "score");
CREATE INDEX IF NOT EXISTS "content_relations_user_id_target_type_target_id_idx" ON "content_relations"("user_id", "target_type", "target_id");
CREATE UNIQUE INDEX IF NOT EXISTS "note_insights_user_id_note_id_kind_key" ON "note_insights"("user_id", "note_id", "kind");
CREATE INDEX IF NOT EXISTS "note_insights_user_id_note_id_input_version_idx" ON "note_insights"("user_id", "note_id", "input_version");

DO $$ BEGIN ALTER TABLE "ai_chats" ADD CONSTRAINT "ai_chats_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "ai_chats" ADD CONSTRAINT "ai_chats_parent_chat_id_fkey" FOREIGN KEY ("parent_chat_id") REFERENCES "ai_chats"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "ai_messages" ADD CONSTRAINT "ai_messages_chat_id_fkey" FOREIGN KEY ("chat_id") REFERENCES "ai_chats"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "ai_context_attachments" ADD CONSTRAINT "ai_context_attachments_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "ai_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "ai_context_attachments" ADD CONSTRAINT "ai_context_attachments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "ai_actions" ADD CONSTRAINT "ai_actions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "ai_runs" ADD CONSTRAINT "ai_runs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "ai_session_entries" ADD CONSTRAINT "ai_session_entries_chat_id_fkey" FOREIGN KEY ("chat_id") REFERENCES "ai_chats"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "ai_automations" ADD CONSTRAINT "ai_automations_chat_id_fkey" FOREIGN KEY ("chat_id") REFERENCES "ai_chats"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "ai_actions" ADD CONSTRAINT "ai_actions_chat_id_fkey" FOREIGN KEY ("chat_id") REFERENCES "ai_chats"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "ai_usage_events" ADD CONSTRAINT "ai_usage_events_chat_id_fkey" FOREIGN KEY ("chat_id") REFERENCES "ai_chats"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "ai_turns" ADD CONSTRAINT "ai_turns_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "ai_usage_events" ADD CONSTRAINT "ai_usage_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "ai_skills" ADD CONSTRAINT "ai_skills_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "ai_automations" ADD CONSTRAINT "ai_automations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "content_embeddings" ADD CONSTRAINT "content_embeddings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "content_relations" ADD CONSTRAINT "content_relations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "note_insights" ADD CONSTRAINT "note_insights_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "ai_turns" ADD CONSTRAINT "ai_turns_chat_id_fkey" FOREIGN KEY ("chat_id") REFERENCES "ai_chats"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "ai_context_attachments" ADD CONSTRAINT "ai_context_attachments_session_entry_id_fkey" FOREIGN KEY ("session_entry_id") REFERENCES "ai_session_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "ai_actions" ADD CONSTRAINT "ai_actions_turn_id_fkey" FOREIGN KEY ("turn_id") REFERENCES "ai_turns"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "ai_usage_events" ADD CONSTRAINT "ai_usage_events_turn_id_fkey" FOREIGN KEY ("turn_id") REFERENCES "ai_turns"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "ai_usage_events" ADD CONSTRAINT "ai_usage_events_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "ai_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "ai_runs" ADD CONSTRAINT "ai_runs_automation_id_fkey" FOREIGN KEY ("automation_id") REFERENCES "ai_automations"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
