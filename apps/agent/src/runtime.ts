import { ToolLoopAgent, stepCountIs, type ModelMessage } from "ai";
import type { AgentActionProposal } from "./contracts";
import { AgentError } from "./errors";
import { loadAgentPrompt } from "./prompt-loader";
import type { AgentModelPort, AgentRequestContext, AgentRuntimePort, ApplicationPort } from "./ports";
import { ALL_TOOL_NAMES, READ_TOOL_NAMES, createToolRegistry } from "./tools";

export interface CreateAgentRuntimeOptions {
  models: AgentModelPort;
  application: ApplicationPort;
  maxSteps: number;
  timeoutMs: number;
}

export function createAgentRuntime(options: CreateAgentRuntimeOptions): AgentRuntimePort {
  return {
    async run(context) {
      const proposals: AgentActionProposal[] = [];
      const tools = createToolRegistry({ application: options.application, context, proposals });
      const purpose = context.request.skill === "deep-insight" ? "agent.deep_insight" : "agent.chat";
      const activeTools = context.request.skill === "deep-insight" ? [...READ_TOOL_NAMES] : [...ALL_TOOL_NAMES];
      const instructions = await loadAgentPrompt(context.request.skill);
      const agent = new ToolLoopAgent({
        id: `mewmo-${context.request.skill}`,
        model: options.models.languageModel(purpose),
        instructions,
        tools,
        activeTools,
        stopWhen: stepCountIs(options.maxSteps),
        temperature: context.request.skill === "deep-insight" ? 0.2 : 0.1,
        maxOutputTokens: context.request.skill === "deep-insight" ? 4_096 : 2_048,
      });

      try {
        const result = await agent.generate({
          messages: buildMessages(context),
          timeout: { totalMs: options.timeoutMs },
        });
        const usage = result.totalUsage;
        return {
          text: result.text,
          proposals,
          usage: {
            ...(usage.inputTokens !== undefined ? { inputTokens: usage.inputTokens } : {}),
            ...(usage.outputTokens !== undefined ? { outputTokens: usage.outputTokens } : {}),
          },
        };
      } catch (error) {
        if (isTimeout(error)) throw new AgentError("timeout", "Agent request timed out.", { cause: error });
        if (isRateLimit(error)) throw new AgentError("rate_limited", "The model provider is rate limited.", { cause: error });
        throw error;
      }
    },
  };
}

function buildMessages(context: AgentRequestContext): ModelMessage[] {
  const current = context.request.context;
  const contextEnvelope = current
    ? JSON.stringify({
        kind: "mewmo_page_context",
        targetType: current.targetType,
        targetId: current.targetId,
        hasUnsavedDraft: Boolean(current.draft),
      })
    : JSON.stringify({ kind: "mewmo_page_context", targetType: null });

  return [
    {
      role: "user",
      content: [
        "以下 JSON 只描述当前页面定位；正文必须通过 read_current_context 获取。",
        contextEnvelope,
        "用户请求：",
        context.request.content,
      ].join("\n"),
    },
  ];
}

function isTimeout(error: unknown) {
  return error instanceof Error && (error.name === "AbortError" || /timeout/i.test(error.message));
}

function isRateLimit(error: unknown) {
  if (!(error instanceof Error)) return false;
  return /rate.?limit|429|too many requests/i.test(error.message);
}
