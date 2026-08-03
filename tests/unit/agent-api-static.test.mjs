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
  // #6: the detail route may expose only the sanitized chip projection
  // (targetType + title) — stored snapshot/extract payloads must not leak.
  assert.match(detail, /sanitizeContextAttachments/);
  assert.match(detail, /sanitizeMessageMetadata/);
  assert.match(detail, /totalTokens/);
  assert.match(detail, /process:\s*z\.array\(processBlockSchema\)/);
  assert.match(detail, /thinking:\s*z\.boolean\(\)/);
  assert.match(detail, /startedAt:\s*z\.string\(\)/);
  assert.match(detail, /completedAt:\s*z\.string\(\)/);
  assert.doesNotMatch(detail, /metadata: message\.metadata/);
  assert.match(detail, /return \[\{ targetType, title \}\];/);
  assert.doesNotMatch(detail, /contentSnapshot|extractedText/);
});

test("agent transcript shows only settled whole-turn token usage", () => {
  const row = read("apps/web/src/components/agent/AssistantRow.tsx");
  const adapter = read("apps/web/src/lib/agent/transcript-adapter.ts");

  assert.match(row, /!isStreaming && row\.totalTokens !== undefined/);
  assert.match(row, /formatTokenCount\(row\.totalTokens\).*tokens/);
  assert.match(adapter, /result\.totalTokens/);
  assert.doesNotMatch(row, /provider|model|cost|purpose/i);
});

test("chat lifecycle commands validate input and preserve ownership boundaries", () => {
  const detail = read("apps/web/src/app/api/agent/chats/[id]/route.ts");
  const clear = read("apps/web/src/app/api/agent/chats/[id]/clear/route.ts");
  const truncate = read("apps/web/src/app/api/agent/chats/[id]/truncate/route.ts");
  const repository = read("packages/db/src/repositories/ai-chats.ts");

  assert.match(detail, /auth\(\)/);
  assert.match(detail, /renameSchema\.safeParse/);
  assert.match(detail, /status: 401/);
  assert.match(detail, /status: 400/);
  assert.match(detail, /createAiChatsRepository\(\)\.update\(session\.user\.id, id/);
  assert.match(detail, /createAiChatsRepository\(\)\.delete\(session\.user\.id, id\)/);
  assert.match(detail, /status: 404/);
  assert.match(clear, /auth\(\)/);
  assert.match(clear, /clearMessages\(session\.user\.id, id\)/);
  assert.match(truncate, /auth\(\)/);
  assert.match(truncate, /truncateFromTurn\(session\.user\.id, id, parsed\.data\.turnId\)/);
  assert.match(truncate, /status: 404/);
  assert.match(repository, /where: \{ id, \.\.\.activeByUser\(userId\) \}/);
  assert.match(repository, /where: \{ id: chatId, \.\.\.activeByUser\(userId\) \}/);
});

test("Mew chat interaction contracts keep stop, thinking, insight, and hero behavior distinct", () => {
  const input = read("apps/web/src/components/agent/ChatInput.tsx");
  const sidebar = read("apps/web/src/components/agent/AgentSidebar.tsx");
  const store = read("apps/web/src/lib/agent/conversation-store.ts");
  const home = read("apps/web/src/app/(app)/mew/page.tsx");
  const contract = read("apps/web/src/lib/agent-contract.ts");
  const streamRoute = read("apps/web/src/app/api/agent/chats/[id]/stream/route.ts");
  const messageRoute = read("apps/web/src/app/api/agent/chats/[id]/messages/route.ts");
  const runtime = read("apps/agent/src/pi/runtime.ts");
  const css = read("apps/web/src/app/globals.css");

  assert.match(input, /const disabled = !chatReady \|\| status === "loading";/, "streaming must leave the next draft editable");
  assert.match(input, /sendGuardUntilRef\.current = Date\.now\(\) \+ STOP_POINTER_GUARD_MS;\s+onStop\(\);/);
  assert.match(store, /setStableRows\(\(rows\) => truncateTranscriptRows\(rows, turnId\)\);[\s\S]*?void performSend\(request\);\s+return true;/, "replacement must acknowledge stream start without waiting for completion");
  assert.match(input, /深度思考/);
  assert.match(input, /onSend\(buildComposerSendOptions\(\{[\s\S]*?\bthinking,/);
  assert.match(sidebar, /\.\.\.\(options\.thinking \? \{ thinking: true \} : \{\}\)/);
  assert.match(contract, /thinking: z\.boolean\(\)\.optional\(\)/);
  assert.match(streamRoute, /thinking: parsed\.data\.thinking/);
  assert.match(messageRoute, /thinking: parsed\.data\.thinking/);
  assert.match(runtime, /thinkingLevelForRequest\(context\.request\.thinking\)/);

  assert.match(home, /context=\{null\}/);
  assert.match(home, /setRequestedSkill\("deep-insight"\)/);
  assert.match(input, /我工作区的最近内容进行深度洞察/);
  assert.match(css, /animation: mewmo-fade-rise/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.mewmo-agent-home__hero,[\s\S]*?animation: none;/);
});

test("chat lifecycle controls lock while an Agent turn is streaming", () => {
  const sidebar = read("apps/web/src/components/shell/AISidebar.tsx");
  const chatsHook = read("apps/web/src/lib/agent/use-agent-chats.ts");
  const switcher = read("apps/web/src/components/agent/ChatSwitcher.tsx");

  assert.match(sidebar, /locked=\{agentChats\.store\.status === "sending"\}/);
  assert.match(chatsHook, /请等待当前回复完成后再清空会话/);
  assert.match(chatsHook, /请等待当前回复完成后再删除会话/);
  assert.match(switcher, /const busy = locked \|\| pendingChatId !== null/);
  assert.match(switcher, /disabled=\{loading \|\| busy\}/);
  assert.match(switcher, /disabled=\{busy\}/);
});

test("client-side note actions require the proposal's original note context", () => {
  const card = read("apps/web/src/components/agent/ConfirmationCard.tsx");

  assert.match(card, /context\.id !== proposal\.clientEffect\?\.noteId/);
  assert.match(card, /请先打开该操作对应的笔记再确认/);
});

test("Agent service owns idempotent multi-turn message persistence", () => {
  const server = read("apps/agent/src/server.ts");
  const runtime = read("apps/agent/src/pi/runtime.ts");
  const service = read("packages/application/src/ai-session-service.ts");
  const schema = read("packages/db/prisma/schema.prisma");
  assert.match(server, /application\.turns\.begin/);
  assert.match(server, /application\.turns\.complete/);
  assert.match(server, /if \(started\.cached\)/);
  assert.match(runtime, /new AgentHarness/);
  assert.match(runtime, /new MewmoSessionStorage/);
  assert.match(service, /userId: actor\.userId/);
  assert.match(service, /requestHash/);
  assert.match(schema, /model AiTurn/);
  assert.match(schema, /@@unique\(\[chatId, clientRequestId\]\)/);
});

test("AI sidebar supports draft context, Deep Insight, proposals, and idempotent retry", () => {
  const sidebar = read("apps/web/src/components/shell/AISidebar.tsx");
  const agentSidebar = read("apps/web/src/components/agent/AgentSidebar.tsx");
  const conversationStore = read("apps/web/src/lib/agent/conversation-store.ts");
  const confirmationCard = read("apps/web/src/components/agent/ConfirmationCard.tsx");
  const transcriptAdapter = read("apps/web/src/lib/agent/transcript-adapter.ts");
  const agentTypes = read("apps/web/src/lib/agent/types.ts");
  const notePage = read("apps/web/src/app/(app)/notes/[slug]/NoteEditorPage.tsx");

  assert.match(sidebar, /requestedSkill/);
  assert.match(sidebar, /deep-insight/);
  assert.match(agentSidebar, /context\.draft/);
  assert.match(conversationStore, /clientRequestId/);
  assert.match(conversationStore, /clientRequestId:\s*crypto\.randomUUID\(\)/, "retry should use a fresh clientRequestId");
  assert.match(agentTypes, /userMessage\?:\s*\{ id\?: string;/, "runtime responses may omit persistence ids");
  assert.match(confirmationCard, /function ConfirmationCard/);
  assert.match(confirmationCard, /executionMode:\s*"client"/);
  assert.match(confirmationCard, /\/api\/agent\/actions\/\$\{encodeURIComponent\(proposal\.id\)\}\/\$\{name\}/);
  assert.match(confirmationCard, /\/api\/agent\/actions\/\$\{encodeURIComponent\(actionId\)\}\/result/);
  assert.match(confirmationCard, /name === "confirm" \|\| name === "retry"/);
  assert.match(conversationStore, /refreshProposalStates\(extractProposals\(persistedRows\)\)/);
  assert.match(transcriptAdapter, /metadata\?\.proposals \?\? \[\]/);
  assert.doesNotMatch(sidebar, /RELATED_PLACEHOLDERS|The Rise of the AI-Native Note App/);

  assert.match(notePage, /draft:\s*\{/);
  assert.match(notePage, /applyDraftPatch/);
  assert.match(notePage, /queueNoteDraftSync/);
  assert.match(notePage, /subscribeNoteDraftSync/);
  assert.match(notePage, /setAgentEditorRevision/);
});
