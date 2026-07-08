# Mewmo Agent Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first production-oriented agent loop: persistent chats, message history, current-content context attachments, and real sidebar chat.

**Architecture:** Use the existing Prisma-backed `AiChat` and `AiMessage` tables, extend them with message status and context attachments, and add a small first-party agent runtime in `@mewmo/ai`. The sidebar Chat tab and future homepage agent will call the same API surface; homepage dashboard cards remain a separate follow-up slice.

**Tech Stack:** Next.js API routes, Prisma, `@mewmo/ai`, OpenAI-compatible chat completions, React sidebar UI.

---

### Task 1: Persistence Contract

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Modify: `packages/db/src/repositories/ai-chats.ts`
- Modify: `packages/db/src/repositories/repositories.test.ts`

- [ ] Add `AiMessageStatus` and `AiContextAttachment` to Prisma.
- [ ] Extend `AiMessage` with `status` and `metadata`.
- [ ] Add repository methods for default chat lookup, message creation, assistant update, and context attachment creation.
- [ ] Cover repository calls with user-scoped tests.

### Task 2: Agent Runtime

**Files:**
- Create: `packages/ai/prompts/agent.system.zh.md`
- Modify: `packages/ai/src/index.ts`
- Modify: `packages/ai/src/summarize.test.ts`

- [ ] Add an agent system prompt separate from summary prompts.
- [ ] Add `generateAgentReply` using the same provider config as summaries.
- [ ] Build message history and current context into model messages.
- [ ] Keep tool execution out of the first runtime; only generate grounded replies.

### Task 3: Agent API

**Files:**
- Create: `apps/web/src/app/api/agent/chats/route.ts`
- Create: `apps/web/src/app/api/agent/chats/[id]/route.ts`
- Create: `apps/web/src/app/api/agent/chats/[id]/messages/route.ts`
- Modify: `tests/unit/ai-summary-api.test.mjs` or add `tests/unit/agent-api-static.test.mjs`

- [ ] Add chat list/create endpoints.
- [ ] Add chat detail endpoint.
- [ ] Add message send endpoint that persists user message, context attachment, assistant placeholder, model reply, and final assistant content.
- [ ] Return JSON first; streaming can be added after the persisted loop is stable.

### Task 4: Sidebar Chat UI

**Files:**
- Modify: `apps/web/src/components/shell/AISidebar.tsx`
- Modify: `apps/web/src/app/(app)/notes/[slug]/NoteEditorPage.tsx`
- Modify: `apps/web/src/app/(app)/notes/page.tsx`

- [ ] Load or create the default chat when opening Chat tab.
- [ ] Render persisted messages.
- [ ] Send user input to the agent message endpoint.
- [ ] Attach current `clip`, `feed_entry`, or `note` context snapshot.
- [ ] Keep Summary tab behavior unchanged.

### Task 5: Verification

**Files:**
- Test: `packages/db/src/repositories/repositories.test.ts`
- Test: `packages/ai/src/summarize.test.ts`
- Test: `tests/unit/agent-api-static.test.mjs`

- [ ] Run `pnpm --filter @mewmo/db test`.
- [ ] Run `pnpm --filter @mewmo/ai test`.
- [ ] Run `node --test tests/unit/agent-api-static.test.mjs`.
- [ ] Run `pnpm --filter @mewmo/web build`.

