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

import type { AgentActionProposal, AgentCitation } from "../contracts";
import { AgentError, toAgentError } from "../errors";
import { createHarnessObservationBridge, type HarnessObservationBridge } from "../observability/harness-bridge";
import { observeAgentTurn, type AgentObservabilityPort } from "../observability/port";
import { loadAgentSystemPrompt, loadPresetSkills, type AgentSkillResource } from "../prompt-loader";
import { loadAgentPromptLink } from "../prompt-manifest";
import type { AgentRuntimeEvent, AgentRuntimePort, ApplicationPort } from "../ports";
import { ALL_TOOL_NAMES } from "../tools";
import type { WebPort } from "../web/port";
import { MewmoSessionStorage } from "./session-storage";
import { createPiToolRegistry, type WebBudget } from "./tools";

export interface CreateAgentRuntimeOptions {
  ai: AIRuntime;
  application: ApplicationPort;
  maxSteps: number;
  timeoutMs: number;
  observability?: AgentObservabilityPort;
  web?: WebPort;
  webSearchBudget?: number;
  webFetchBudget?: number;
}

export function createAgentRuntime(options: CreateAgentRuntimeOptions): AgentRuntimePort {
  return {
    async run(context, onEvent) {
      return observeAgentTurn(options.observability, {
        userId: context.actor.userId,
        chatId: context.chatId,
        turnId: context.turnId,
        configuredMaxRetries: AGENT_PROVIDER_MAX_RETRIES,
        input: context.request,
      }, async (observation) => {
        let observationBridge: HarnessObservationBridge | undefined;
        let env: NodeExecutionEnv | undefined;
        try {
          const proposals: AgentActionProposal[] = [];
          const citations: AgentCitation[] = [];
          const webBudget: WebBudget = { searchRemaining: options.webSearchBudget ?? 0, fetchRemaining: options.webFetchBudget ?? 0 };
          const tools = createPiToolRegistry({ application: options.application, context, proposals, citations, ...(options.web ? { web: options.web, webBudget } : {}) });
          const skills = await resolveSkills(options.application, context.actor);
          const selected = context.request.skillId ? skills.find((skill) => skill.name === context.request.skillId || skill.id === context.request.skillId) : undefined;
          if (context.request.skillId && !selected) throw new AgentError("bad_request", "Selected Agent skill was not found or is disabled.");
          const purpose = selected?.modelPurpose ?? "agent.chat";
          const activeToolNames = selected ? selected.allowedTools : [...ALL_TOOL_NAMES];
          if (activeToolNames.some((name) => !tools.some((tool) => tool.name === name))) {
            throw new AgentError("bad_request", "Selected Agent skill references an unavailable tool.");
          }
          assertSafeToolConfiguration(tools.map((tool) => tool.name), activeToolNames);
          const model = options.ai.model(purpose);
          const pricing = options.ai.modelPricing(purpose);
          observation.configure({ purpose, provider: model.provider, requestedModel: model.id });
          const prompt = await loadAgentPromptLink(selected?.id === "preset:deep-insight" ? "agent/skills/deep-insight.zh" : "agent/system.zh");
          const bridge = createHarnessObservationBridge({ observation, purpose, provider: model.provider, requestedModel: model.id, pricingKnown: pricing.known, ...(prompt ? { prompt } : {}) });
          observationBridge = bridge;
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
          const systemPrompt = await buildSystemPrompt(skills, context.request.context);
          env = new NodeExecutionEnv({ cwd: process.cwd() });
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
            streamOptions: { timeoutMs: options.timeoutMs, maxRetries: AGENT_PROVIDER_MAX_RETRIES, cacheRetention: "short" },
          });
          let providerTurns = 0;
          harness.on("before_provider_request", () => {
            providerTurns += 1;
            if (providerTurns > options.maxSteps) throw new AgentError("conflict", "Agent reached the configured turn limit.");
            bridge.providerRequestStarted();
            return undefined;
          });
          harness.on("before_provider_payload", (event) => {
            bridge.providerPayload(event.payload);
            return undefined;
          });
          harness.on("tool_call", (event) => {
            if (!activeToolNames.includes(event.toolName)) return { block: true, reason: "Tool is not permitted by the active Skill." };
          });
          harness.subscribe(async (event) => {
            bridge.event(event);
            await emitRuntimeEvent(event, onEvent);
          });

          await onEvent?.({ type: "start" });
          const response = selected
            ? await harness.skill(selected.name, context.request.content)
            : await harness.prompt(context.request.content);
          assertAgentResponseSucceeded(response);
          const branch = await session.getBranch();
          const compactionContext = await session.buildContext();
          const estimate = estimateContextTokens(compactionContext.messages);
          if (shouldCompact(estimate.tokens, model.contextWindow, DEFAULT_COMPACTION_SETTINGS)) {
            const compactionSequence = bridge.compactionStarted(compactionContext);
            const compacted = await harness.compact();
            bridge.compactionCompleted(compactionSequence, compacted);
            await onEvent?.({ type: "compaction" });
          }
          const userEntry = storage.getAppendedMessageEntry("user");
          const assistantEntry = storage.getAppendedMessageEntry("assistant") ?? [...branch].reverse().find((entry) => (
            entry.type === "message"
            && entry.message.role === "assistant"
            && entry.message.stopReason !== "toolUse"
          ));
          if (!userEntry || !assistantEntry || assistantEntry.type !== "message") throw new AgentError("internal_error", "Pi session did not persist the completed turn.");
          await onEvent?.({ type: "end" });
          const result = {
            text: contentText(response.content),
            proposals,
            citations,
            userEntryId: userEntry.id,
            assistantEntryId: assistantEntry.id,
            usage: viewUsage(response),
          };
          observation.completed({ providerCallCount: bridge.providerCallCount(), generationCount: bridge.generationCount(), output: result });
          return result;
        } catch (error) {
          const reported = isTimeout(error)
            ? new AgentError("timeout", "Agent request timed out.", { cause: error })
            : isRateLimit(error)
              ? new AgentError("rate_limited", "The model provider is rate limited.", { cause: error })
              : error;
          const normalized = toAgentError(reported);
          observation.failed({
            code: normalized.code,
            retryable: normalized.retryable,
            providerCallCount: observationBridge?.providerCallCount() ?? 0,
            generationCount: observationBridge?.generationCount() ?? 0,
          });
          throw reported;
        } finally {
          await env?.cleanup();
        }
      });
    },
  };
}

const AGENT_PROVIDER_MAX_RETRIES = 2;

export function assertAgentResponseSucceeded(response: Pick<AssistantMessage, "stopReason" | "errorMessage">) {
  if (response.stopReason === "aborted") {
    throw new AgentError("timeout", response.errorMessage ?? "Agent request timed out.");
  }
  if (response.stopReason === "error") {
    const message = response.errorMessage ?? "The model provider failed to return a response.";
    const cause = new Error(message);
    throw new AgentError(isTimeout(cause) ? "timeout" : isRateLimit(cause) ? "rate_limited" : "dependency_unavailable", message);
  }
}

const FORBIDDEN_CODING_TOOL_NAMES = new Set([
  "bash",
  "edit",
  "find",
  "grep",
  "ls",
  "read",
  "write",
]);

export function assertSafeToolConfiguration(registeredToolNames: string[], activeToolNames: string[]) {
  const unsafe = [...new Set([...registeredToolNames, ...activeToolNames])]
    .filter((name) => FORBIDDEN_CODING_TOOL_NAMES.has(name.toLowerCase()));
  if (unsafe.length > 0) {
    throw new AgentError("internal_error", `Coding tools are disabled in Mewmo Agent: ${unsafe.join(", ")}.`);
  }
}

async function resolveSkills(application: ApplicationPort, actor: Parameters<ApplicationPort["skills"]["list"]>[0]["actor"]): Promise<AgentSkillResource[]> {
  const [preset, custom] = await Promise.all([loadPresetSkills(), application.skills.list({ actor })]);
  return [...preset, ...custom.map((skill) => ({ ...skill, filePath: `mewmo://skills/${skill.id}` }))];
}

async function buildSystemPrompt(
  skills: AgentSkillResource[],
  current: { targetType: string; targetId: string; draft?: unknown } | null,
) {
  const base = await loadAgentSystemPrompt();
  return `${base}\n\n${pageContextInstruction(current)}\n\n${formatSkillsForSystemPrompt(skills as Skill[])}`;
}

export function pageContextInstruction(current: { targetType: string; targetId: string; draft?: unknown } | null) {
  return [
    "以下 JSON 只描述当前页面定位；正文必须通过 read_current_context 获取。",
    JSON.stringify(current ? { kind: "mewmo_page_context", targetType: current.targetType, targetId: current.targetId, hasUnsavedDraft: Boolean(current.draft) } : { kind: "mewmo_page_context", targetType: null }),
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
  return error instanceof Error && (error.name === "AbortError" || /timeout|timed out/i.test(error.message));
}

function isRateLimit(error: unknown) {
  return error instanceof Error && /rate.?limit|429|too many requests/i.test(error.message);
}
