import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(path, "utf8");

test("agent chat API persists chats, messages, and context attachments", () => {
  const chatsRoute = "apps/web/src/app/api/agent/chats/route.ts";
  const chatRoute = "apps/web/src/app/api/agent/chats/[id]/route.ts";
  const messagesRoute = "apps/web/src/app/api/agent/chats/[id]/messages/route.ts";

  assert.ok(existsSync(chatsRoute), "chat collection route should exist");
  assert.ok(existsSync(chatRoute), "chat detail route should exist");
  assert.ok(existsSync(messagesRoute), "chat message route should exist");

  const chats = read(chatsRoute);
  const detail = read(chatRoute);
  const messages = read(messagesRoute);

  assert.match(chats, /auth\(\)/, "chat list/create should require auth");
  assert.match(chats, /findOrCreateDefault/, "chat create should support the default mewmo chat");
  assert.match(detail, /findById\(session\.user\.id,\s*id\)/, "chat detail should be user-scoped");
  assert.match(messages, /generateAgentReply/, "message route should call the agent runtime");
  assert.match(messages, /addMessage\(id,\s*\{[\s\S]*role:\s*"user"/, "message route should persist user messages");
  assert.match(messages, /addContextAttachment/, "message route should persist current-content context attachments");
  assert.match(messages, /updateMessage\(id,\s*String\(assistantMessage\.id\)/, "message route should update assistant placeholder");
  assert.match(messages, /resolveAgentContext/, "message route should resolve context server-side");
});

test("AI sidebar chat tab uses persisted agent chats instead of placeholder copy", () => {
  const sidebar = read("apps/web/src/components/shell/AISidebar.tsx");

  assert.match(sidebar, /\/api\/agent\/chats/, "sidebar should load or create persisted chats");
  assert.match(sidebar, /\/api\/agent\/chats\/\$\{chat\.id\}\/messages/, "sidebar should send messages to the agent API");
  assert.match(sidebar, /context:\s*context\s*\?/, "sidebar should pass current context identity when available");
  assert.doesNotMatch(sidebar, /对话流还没有接入/, "sidebar should not render placeholder chat copy");
  assert.doesNotMatch(sidebar, /AI 暂未接入/, "sidebar input should no longer be disabled placeholder copy");
});
