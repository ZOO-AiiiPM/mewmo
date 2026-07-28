-- Reconcile schema changes that were applied manually after the production baseline.
-- Every statement is additive and idempotent so existing Neon databases retain
-- historical tables and indexes while fresh databases reach the same shape.

CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "vector";

ALTER TABLE "note_shares"
  ADD COLUMN IF NOT EXISTS "expires_at" TIMESTAMP(3);

ALTER TABLE "content_embeddings"
  ADD COLUMN IF NOT EXISTS "embedding_vector" vector(768);

CREATE INDEX IF NOT EXISTS "content_embeddings_embedding_vector_hnsw"
  ON "content_embeddings" USING hnsw ("embedding_vector" vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

CREATE INDEX IF NOT EXISTS "notes_title_trgm"
  ON "notes" USING gin ("title" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "notes_content_trgm"
  ON "notes" USING gin ("content" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "clips_title_trgm"
  ON "clips" USING gin ("title" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "clips_content_trgm"
  ON "clips" USING gin ("content" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "feed_entries_title_trgm"
  ON "feed_entries" USING gin ("title" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "feed_entries_content_trgm"
  ON "feed_entries" USING gin ("content" gin_trgm_ops);
