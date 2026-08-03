import { readFile } from "node:fs/promises";

import { createAIRuntime, loadAIRuntimeConfig } from "@mewmo/ai";
import { AgentHarness, InMemorySessionStorage, NodeExecutionEnv, Session } from "@earendil-works/pi-agent-core/node";

import { loadAgentSystemPrompt } from "../src/prompt-loader";
import { TEST_ACTOR, createApplicationStub } from "../src/testing";
import { WRITE_TOOL_NAMES } from "../src/tools";
import { createPiToolRegistry } from "../src/pi/tools";

interface IntentCase {
  id: string;
  input: string;
  expectedWriteTools?: string[];
  expectedFirstTool?: string;
  expectedUrl?: string;
}

const cases = (JSON.parse(await readFile(new URL("./cases.json", import.meta.url), "utf8")) as IntentCase[])
  .filter((item) => item.expectedWriteTools !== undefined);
const ai = createAIRuntime(loadAIRuntimeConfig());
const systemPrompt = await loadAgentSystemPrompt();
let failed = false;

for (const item of cases) {
  const env = new NodeExecutionEnv({ cwd: process.cwd() });
  const calls: Array<{ name: string; args: unknown }> = [];
  const context = {
    actor: TEST_ACTOR,
    chatId: `eval-${item.id}`,
    turnId: `eval-${item.id}`,
    workerId: "url-intent-eval",
    request: { clientRequestId: `eval-${item.id}`, content: item.input, skillId: undefined, context: null },
  };
  const tools = createPiToolRegistry({
    application: createApplicationStub(),
    context,
    proposals: [],
    web: {
      search: async () => ({ results: [] }),
      fetch: async ({ url }) => ({ requestedUrl: url, finalUrl: url, title: "Example", content: "Public example page.", truncated: false }),
    },
    webBudget: { searchRemaining: 2, fetchRemaining: 5 },
    citations: [],
  });
  const harness = new AgentHarness({
    env,
    session: new Session(new InMemorySessionStorage()),
    models: ai.models(),
    model: ai.model("agent.chat"),
    systemPrompt,
    tools,
    activeToolNames: tools.map((tool) => tool.name),
    thinkingLevel: "off",
    streamOptions: { timeoutMs: 45_000, maxRetries: 2, cacheRetention: "short" },
  });
  harness.subscribe((event) => {
    if (event.type === "tool_execution_start") calls.push({ name: event.toolName, args: event.args });
  });
  try {
    await harness.prompt(item.input);
    const actual = calls.map((call) => call.name).filter((name) => (WRITE_TOOL_NAMES as readonly string[]).includes(name));
    const expected = item.expectedWriteTools ?? [];
    const first = calls[0];
    const firstToolMatches = item.expectedFirstTool === undefined || first?.name === item.expectedFirstTool;
    const firstArgs = typeof first?.args === "object" && first.args !== null ? first.args as Record<string, unknown> : undefined;
    const urlMatches = item.expectedUrl === undefined || firstArgs?.url === item.expectedUrl;
    const passed = JSON.stringify(actual) === JSON.stringify(expected) && firstToolMatches && urlMatches;
    console.log(`${passed ? "PASS" : "FAIL"} ${item.id}: ${JSON.stringify(calls.map((call) => call.name))}`);
    if (!passed) failed = true;
  } finally {
    await env.cleanup();
  }
}

if (failed) process.exitCode = 1;
