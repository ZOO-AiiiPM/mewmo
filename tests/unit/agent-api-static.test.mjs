import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(path, "utf8");

test("agent browser API is an authenticated BFF with explicit service degradation", () => {
  const messagePath = "apps/web/src/app/api/agent/chats/[id]/messages/route.ts";
  const actionPath = "apps/web/src/app/api/agent/actions/[id]/[command]/route.ts";
  const resultPath = "apps/web/src/app/api/agent/actions/[id]/result/route.ts";
  const actionPathById = "apps/web/src/app/api/agent/actions/[id]/route.ts";
  const clientPath = "apps/web/src/lib/agent-server-client.ts";

  for (const path of [messagePath, actionPath, resultPath, actionPathById, clientPath]) {
    assert.ok(existsSync(path), `${path} should exist`);
  }

  const messages = read(messagePath);
  const actions = read(actionPath);
  const contract = read("apps/web/src/lib/agent-contract.ts");
  const client = read(clientPath);

  assert.match(messages, /auth\(\)/);
  assert.match(messages, /agentMessageRequestSchema\.safeParse/);
  assert.match(messages, /requestAgentServer\(session\.user\.id/);
  assert.match(messages, /skill:\s*parsed\.data\.skillId === "deep-insight"/);
  assert.match(messages, /targetType:\s*context\.resource\.type/);
  assert.match(messages, /\/v1\/chats\/\$\{encodeURIComponent\(id\)\}\/messages/);
  assert.doesNotMatch(messages, /generateAgentReply|getPrisma|contentSnapshot/);
  assert.match(actions, /\["confirm", "cancel", "retry"\]/);
  assert.match(actions, /executionMode:\s*parsed\.data\.executionMode \?\? "server"/);
  assert.match(contract, /executionMode/);
  assert.match(client, /AGENT_SERVER_URL/);
  assert.match(client, /AGENT_INTERNAL_SECRET/);
  assert.match(client, /Authorization: `Bearer \$\{createAgentIdentityToken/);
  assert.match(client, /source:\s*"web_bff"/);
  assert.match(client, /sid:\s*randomUUID\(\)/);
  assert.match(client, /agent_not_configured/);
  assert.doesNotMatch(client, /NEXT_PUBLIC_/);
  assert.match(read(actionPathById), /auth\(\)/);
  assert.match(read(actionPathById), /\/v1\/actions\/\$\{encodeURIComponent\(id\)\}/);
});

test("chat history strips context snapshots and leaves a pagination contract", () => {
  const collection = read("apps/web/src/app/api/agent/chats/route.ts");
  const detail = read("apps/web/src/app/api/agent/chats/[id]/route.ts");

  assert.match(collection, /toChatView/);
  assert.match(collection, /pageInfo:\s*\{ nextCursor: null \}/);
  assert.doesNotMatch(collection, /contextAttachments:/);
  assert.match(detail, /pageInfo:\s*\{ nextCursor: null \}/);
  assert.doesNotMatch(detail, /contextAttachments/);
});

test("Agent service owns idempotent multi-turn message persistence", () => {
  const server = read("apps/agent/src/server.ts");
  const runtime = read("apps/agent/src/runtime.ts");
  const service = read("packages/application/src/ai-chat-service.ts");
  const schema = read("packages/db/prisma/schema.prisma");
  assert.match(server, /application\.chats\.prepareTurn/);
  assert.match(server, /application\.chats\.completeTurn/);
  assert.match(server, /if \(turn\.cached\)/);
  assert.match(runtime, /\.\.\.context\.history\.map/);
  assert.match(service, /userId: actor\.userId/);
  assert.match(service, /chat_turn_role/);
  assert.match(schema, /clientRequestId\s+String\?/);
  assert.match(schema, /@@unique\(\[chatId, clientRequestId, role\], name: "chat_turn_role"\)/);
});

test("AI sidebar supports draft context, Deep Insight, proposals, and idempotent retry", () => {
  const sidebar = read("apps/web/src/components/shell/AISidebar.tsx");
  const notePage = read("apps/web/src/app/(app)/notes/[slug]/NoteEditorPage.tsx");

  assert.match(sidebar, /requestedSkill/);
  assert.match(sidebar, /deep-insight/);
  assert.match(sidebar, /context\.draft/);
  assert.match(sidebar, /clientRequestId/);
  assert.match(sidebar, /performSend\(failedSend\)/, "retry should reuse the same clientRequestId");
  assert.match(sidebar, /data\.userMessage\.id \?\? localUserId/, "runtime responses may omit persistence ids");
  assert.match(sidebar, /ProposalCard/);
  assert.match(sidebar, /executionMode:\s*"client"/);
  assert.match(sidebar, /\/api\/agent\/actions\/\$\{proposal\.id\}\/\$\{name\}/);
  assert.match(sidebar, /\/api\/agent\/actions\/\$\{actionId\}\/result/);
  assert.match(sidebar, /name === "retry"/);
  assert.match(sidebar, /proposalsFromMessages/);
  assert.doesNotMatch(sidebar, /RELATED_PLACEHOLDERS|The Rise of the AI-Native Note App/);

  assert.match(notePage, /draft:\s*\{/);
  assert.match(notePage, /applyDraftPatch/);
  assert.match(notePage, /queueNoteDraftSync/);
  assert.match(notePage, /subscribeNoteDraftSync/);
  assert.match(notePage, /setAgentEditorRevision/);
});
