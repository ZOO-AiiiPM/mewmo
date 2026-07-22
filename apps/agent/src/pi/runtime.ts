import type { AIRuntime } from "@mewmo/ai";
import { contentText, type AssistantMessage } from "@earendil-works/pi-ai";
import {
  AgentHarness,
  DEFAULT_COMPACTION_SETTINGS,
  NodeExecutionEnv,
  Session,
  estimateContextTokens,
  formatSkillsForSystemPrompt,
  shouldCompact,
  type AgentHarnessEvent,
  type Skill,
} from "@earendil-works/pi-agent-core/node";

import type { AgentActionProposal } from "../contracts";
import { AgentError } from "../errors";
import { loadAgentSystemPrompt, loadPresetSkills, type AgentSkillResource } from "../prompt-loader";
import type { AgentRuntimeEvent, AgentRuntimePort, ApplicationPort } from "../ports";
import { ALL_TOOL_NAMES } from "../tools";
import { MewmoSessionStorage } from "./session-storage";
import { createPiToolRegistry } from "./tools";

export interface CreateAgentRuntimeOptions {
  ai: AIRuntime;
  application: ApplicationPort;
  maxSteps: number;
  timeoutMs: number;
}

export function createAgentRuntime(options: CreateAgentRuntimeOptions): AgentRuntimePort {
  return {
    async run(context, onEvent) {
      const proposals: AgentActionProposal[] = [];
      const tools = createPiToolRegistry({ application: options.application, context, proposals });
      const skills = await resolveSkills(options.application, context.actor);
      const selected = context.request.skillId ? skills.find((skill) => skill.name === context.request.skillId || skill.id === context.request.skillId) : undefined;
      if (context.request.skillId && !selected) throw new AgentError("bad_request", "Selected Agent skill was not found or is disabled.");
      const purpose = selected?.modelPurpose ?? "agent.chat";
      const activeToolNames = selected ? selected.allowedTools : [...ALL_TOOL_NAMES];
      if (activeToolNames.some((name) => !tools.some((tool) => tool.name === name))) {
        throw new AgentError("bad_request", "Selected Agent skill references an unavailable tool.");
      }
      const model = options.ai.model(purpose);
      const pricing = options.ai.modelPricing(purpose);
      const storage = new MewmoSessionStorage({
        application: options.application,
        actor: context.actor,
        chatId: context.chatId,
        turnId: context.turnId,
        purpose,
        requestedProvider: model.provider,
        requestedModel: model.id,
        pricingKnown: pricing.known,
        ...(pricing.priceSnapshot ? { priceSnapshot: pricing.priceSnapshot } : {}),
      });
      const session = new Session(storage);
      const systemPrompt = await buildSystemPrompt(skills);
      const env = new NodeExecutionEnv({ cwd: process.cwd() });
      const harness = new AgentHarness({
        env,
        session,
        models: options.ai.models(),
        model,
        systemPrompt,
        tools,
        resources: { skills },
        activeToolNames,
        thinkingLevel: selected?.modelPurpose === "agent.deep_insight" ? "medium" : "off",
        streamOptions: { timeoutMs: options.timeoutMs, maxRetries: 2, cacheRetention: "short" },
      });
      let providerTurns = 0;
      harness.on("before_provider_request", () => {
        providerTurns += 1;
        if (providerTurns > options.maxSteps) throw new AgentError("conflict", "Agent reached the configured turn limit.");
        return undefined;
      });
      harness.on("tool_call", (event) => {
        if (!activeToolNames.includes(event.toolName)) return { block: true, reason: "Tool is not permitted by the active Skill." };
      });
      harness.subscribe(async (event) => emitRuntimeEvent(event, onEvent));

      try {
        await onEvent?.({ type: "start" });
        const prompt = promptEnvelope(context.request.content, context.request.context);
        const response = selected ? await harness.skill(selected.name, prompt) : await harness.prompt(prompt);
        const branch = await session.getBranch();
        const estimate = estimateContextTokens((await session.buildContext()).messages);
        if (shouldCompact(estimate.tokens, model.contextWindow, DEFAULT_COMPACTION_SETTINGS)) {
          await harness.compact();
          await onEvent?.({ type: "compaction" });
        }
        const userEntry = storage.getAppendedMessageEntry("user");
        const assistantEntry = storage.getAppendedMessageEntry("assistant") ?? [...branch].reverse().find((entry) => entry.type === "message" && entry.message.role === "assistant");
        if (!userEntry || !assistantEntry || assistantEntry.type !== "message") throw new AgentError("internal_error", "Pi session did not persist the completed turn.");
        await onEvent?.({ type: "end" });
        return {
          text: contentText(response.content),
          proposals,
          userEntryId: userEntry.id,
          assistantEntryId: assistantEntry.id,
          usage: viewUsage(response),
        };
      } catch (error) {
        if (isTimeout(error)) throw new AgentError("timeout", "Agent request timed out.", { cause: error });
        if (isRateLimit(error)) throw new AgentError("rate_limited", "The model provider is rate limited.", { cause: error });
        throw error;
      } finally {
        await env.cleanup();
      }
    },
  };
}

async function resolveSkills(application: ApplicationPort, actor: Parameters<ApplicationPort["skills"]["list"]>[0]["actor"]): Promise<AgentSkillResource[]> {
  const [preset, custom] = await Promise.all([loadPresetSkills(), application.skills.list({ actor })]);
  return [...preset, ...custom.map((skill) => ({ ...skill, filePath: `mewmo://skills/${skill.id}` }))];
}

async function buildSystemPrompt(skills: AgentSkillResource[]) {
  const base = await loadAgentSystemPrompt();
  return `${base}\n\n${formatSkillsForSystemPrompt(skills as Skill[])}`;
}

function promptEnvelope(content: string, current: { targetType: string; targetId: string; draft?: unknown } | null) {
  return [
    "以下 JSON 只描述当前页面定位；正文必须通过 read_current_context 获取。",
    JSON.stringify(current ? { kind: "mewmo_page_context", targetType: current.targetType, targetId: current.targetId, hasUnsavedDraft: Boolean(current.draft) } : { kind: "mewmo_page_context", targetType: null }),
    "用户请求：",
    content,
  ].join("\n");
}

function viewUsage(message: AssistantMessage) {
  return {
    inputTokens: message.usage.input,
    outputTokens: message.usage.output,
    cacheReadTokens: message.usage.cacheRead,
    cacheWriteTokens: message.usage.cacheWrite,
    ...(message.usage.reasoning === undefined ? {} : { reasoningTokens: message.usage.reasoning }),
    providerCostUsd: message.usage.cost.total,
  };
}

async function emitRuntimeEvent(event: AgentHarnessEvent, listener?: (event: AgentRuntimeEvent) => Promise<void> | void) {
  if (!listener) return;
  if (event.type === "message_update") {
    if (event.assistantMessageEvent.type === "text_delta") await listener({ type: "text_delta", delta: event.assistantMessageEvent.delta });
    if (event.assistantMessageEvent.type === "thinking_delta") await listener({ type: "thinking_delta", delta: event.assistantMessageEvent.delta });
    return;
  }
  if (event.type === "tool_execution_start") await listener({ type: "tool_start", toolCallId: event.toolCallId, toolName: event.toolName });
  if (event.type === "tool_execution_end") await listener({ type: "tool_end", toolCallId: event.toolCallId, toolName: event.toolName, isError: event.isError });
}

function isTimeout(error: unknown) {
  return error instanceof Error && (error.name === "AbortError" || /timeout/i.test(error.message));
}

function isRateLimit(error: unknown) {
  return error instanceof Error && /rate.?limit|429|too many requests/i.test(error.message);
}
