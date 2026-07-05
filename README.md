# mewmo

Cloud-first AI information manager. Collect, organize, and resurface your knowledge with AI.

## Getting Started

### Prerequisites

- Node.js 22+
- pnpm 11+
- Docker (for local Postgres + Redis)

### Setup

```bash
# 1. Clone & install
git clone https://github.com/ZOO-AiiiPM/mewmo.git
cd mewmo
pnpm install

# 2. Environment
cp .env.example .env.local
# Edit .env.local — 本地开发的 DATABASE_URL 和 REDIS_URL 已有默认值
# AI keys 找 zoo 拿

# 3. Start local services
docker compose -f docker/docker-compose.yml up -d

# 4. Initialize database
pnpm db:push
pnpm db:generate

# 5. Run
pnpm dev
```

Open http://localhost:3000 — you should see the web app.

### Common Commands

| Command | What it does |
|---------|-------------|
| `pnpm dev` | Start all apps (web + agent) |
| `pnpm build` | Build all packages and apps |
| `pnpm lint` | Lint everything |
| `pnpm test` | Run all tests |
| `pnpm db:push` | Push Prisma schema to local Postgres |
| `pnpm db:generate` | Generate Prisma Client |
| `pnpm --filter @mewmo/web dev` | Start only the web app |
| `pnpm --filter @mewmo/agent dev` | Start only the agent worker |

### Environment Variables

See `.env.example` for the full list with comments. Summary:

| Category | Who provides | Notes |
|----------|-------------|-------|
| Database + Redis | Docker (local) | Default values work out of the box |
| OAuth (Google) | Each developer | Create your own OAuth app in Google Console |
| AI keys | Team shared | Ask zoo for the shared keys |
| R2 / Resend | Team shared | Ask zoo |

## Team Workflow

### Branch Strategy

- `main` — 2.0 primary development branch
- `1.0version` — legacy Tauri reference only
- `feature/*` — feature branches off `main`

### PR Preview

Every PR automatically gets:
- **Vercel Preview Deploy** — live URL in the PR comment
- **Neon Database Branch** — isolated DB, no data pollution

Just push your branch and open a PR against `main`.

### Staging

The `main` branch auto-deploys to staging on every push.

## Architecture

See `docs/02-architecture.md` for the full architecture doc.

```
apps/web        → Next.js 16 (browser + API)
apps/agent      → Node.js worker (AI jobs, RSS fetch)
apps/admin      → Admin dashboard
apps/extension  → Browser extension
packages/       → Shared code (db, ai, auth, queue, storage, etc.)
```

## Tech Stack

- Next.js 16 · TypeScript 6 · PostgreSQL · Redis · Prisma 7
- Tailwind 4 · Vercel AI SDK 6 · BullMQ · Auth.js
- Zod 4 · ESLint 10 · Vitest
