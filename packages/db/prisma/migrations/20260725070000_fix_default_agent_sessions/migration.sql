ALTER TABLE "ai_chats" ADD COLUMN "default_key" TEXT;

WITH ranked_defaults AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "user_id"
      ORDER BY "updated_at" DESC, "created_at" DESC, "id" DESC
    ) AS "position"
  FROM "ai_chats"
  WHERE "deleted_at" IS NULL AND "title" = 'mewmo'
)
UPDATE "ai_chats" AS chats
SET "default_key" = 'sidebar'
FROM ranked_defaults
WHERE chats."id" = ranked_defaults."id" AND ranked_defaults."position" = 1;

CREATE UNIQUE INDEX "ai_chats_user_id_default_key_key"
ON "ai_chats"("user_id", "default_key");
