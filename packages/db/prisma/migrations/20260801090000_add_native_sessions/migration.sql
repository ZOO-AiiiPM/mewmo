-- ZOO-88: server-side Apple native bearer sessions.
-- Additive only. Native clients exchange opaque short-lived access tokens
-- (signed JWT, never stored) plus one-time-rotatable refresh tokens (hash only).

CREATE TABLE "native_sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "refresh_token_hash" TEXT NOT NULL,
    "device_id" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "device_name" TEXT,
    "last_ip" TEXT,
    "last_user_agent" TEXT,
    "last_used_at" TIMESTAMP(3) NOT NULL,
    "last_refreshed_at" TIMESTAMP(3),
    "refresh_expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "refresh_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "native_sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "native_sessions_refresh_token_hash_key" ON "native_sessions"("refresh_token_hash");

CREATE INDEX "native_sessions_user_id_revoked_at_idx" ON "native_sessions"("user_id", "revoked_at");

CREATE INDEX "native_sessions_device_id_user_id_idx" ON "native_sessions"("device_id", "user_id");

ALTER TABLE "native_sessions"
    ADD CONSTRAINT "native_sessions_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
