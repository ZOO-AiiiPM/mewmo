-- Additive AI/Agent schema for databases that contain legacy tables.
-- This script intentionally does not drop or rename anything.

DO $$ BEGIN CREATE TYPE "AiActionRiskLevel" AS ENUM ('write', 'destructive'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "AiActionExecutionMode" AS ENUM ('server', 'client'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "AiActionStatus" AS ENUM ('proposed', 'confirmed', 'executing', 'succeeded', 'failed', 'cancelled'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "AiRunKind" AS ENUM ('summary', 'embedding', 'relation', 'note_insight'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "AiRunStatus" AS ENUM ('queued', 'running', 'succeeded', 'failed', 'superseded'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "AiTargetType" AS ENUM ('note', 'clip', 'feed_entry'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "NoteInsightKind" AS ENUM ('completeness', 'duplicate_viewpoint', 'viewpoint_change'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "ai_messages" ADD COLUMN IF NOT EXISTS "client_request_id" TEXT;

CREATE TABLE IF NOT EXISTS "ai_actions" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
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

CREATE TABLE IF NOT EXISTS "ai_runs" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "kind" "AiRunKind" NOT NULL,
  "target_type" "AiTargetType" NOT NULL,
  "target_id" TEXT NOT NULL,
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
  "updated_at" TIMESTAMP(3) NOT NULL,
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
  "updated_at" TIMESTAMP(3) NOT NULL,
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
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "note_insights_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ai_messages_chat_id_client_request_id_role_key" ON "ai_messages"("chat_id", "client_request_id", "role");
CREATE INDEX IF NOT EXISTS "ai_actions_user_id_status_created_at_idx" ON "ai_actions"("user_id", "status", "created_at");
CREATE UNIQUE INDEX IF NOT EXISTS "ai_actions_user_id_idempotency_key_key" ON "ai_actions"("user_id", "idempotency_key");
CREATE INDEX IF NOT EXISTS "ai_runs_status_available_at_priority_created_at_idx" ON "ai_runs"("status", "available_at", "priority", "created_at");
CREATE INDEX IF NOT EXISTS "ai_runs_user_id_target_type_target_id_created_at_idx" ON "ai_runs"("user_id", "target_type", "target_id", "created_at");
CREATE INDEX IF NOT EXISTS "ai_runs_worker_id_lease_expires_at_idx" ON "ai_runs"("worker_id", "lease_expires_at");
CREATE UNIQUE INDEX IF NOT EXISTS "ai_runs_user_id_idempotency_key_key" ON "ai_runs"("user_id", "idempotency_key");
CREATE INDEX IF NOT EXISTS "content_embeddings_user_id_target_type_input_version_idx" ON "content_embeddings"("user_id", "target_type", "input_version");
CREATE UNIQUE INDEX IF NOT EXISTS "content_embeddings_user_id_target_type_target_id_key" ON "content_embeddings"("user_id", "target_type", "target_id");
CREATE INDEX IF NOT EXISTS "content_relations_user_id_source_type_source_id_score_idx" ON "content_relations"("user_id", "source_type", "source_id", "score");
CREATE INDEX IF NOT EXISTS "content_relations_user_id_target_type_target_id_idx" ON "content_relations"("user_id", "target_type", "target_id");
CREATE UNIQUE INDEX IF NOT EXISTS "content_relations_user_id_source_type_source_id_target_type_key" ON "content_relations"("user_id", "source_type", "source_id", "target_type", "target_id");
CREATE INDEX IF NOT EXISTS "note_insights_user_id_note_id_input_version_idx" ON "note_insights"("user_id", "note_id", "input_version");
CREATE UNIQUE INDEX IF NOT EXISTS "note_insights_user_id_note_id_kind_key" ON "note_insights"("user_id", "note_id", "kind");

DO $$ BEGIN
  ALTER TABLE "ai_actions" ADD CONSTRAINT "ai_actions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "ai_runs" ADD CONSTRAINT "ai_runs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "content_embeddings" ADD CONSTRAINT "content_embeddings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "content_relations" ADD CONSTRAINT "content_relations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "note_insights" ADD CONSTRAINT "note_insights_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
