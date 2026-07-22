import { readFile } from "node:fs/promises";

export interface AgentSkillResource {
  id: string;
  name: string;
  description: string;
  content: string;
  filePath: string;
  modelPurpose: "agent.chat" | "agent.deep_insight";
  allowedTools: string[];
}

export async function loadAgentSystemPrompt() {
  return (await readFile(new URL("../prompts/system.zh.md", import.meta.url), "utf8")).trim();
}

export async function loadPresetSkills(): Promise<AgentSkillResource[]> {
  const content = (await readFile(new URL("../prompts/skills/deep-insight.zh.md", import.meta.url), "utf8")).trim();
  return [{
    id: "preset:deep-insight",
    name: "deep-insight",
    description: "基于当前内容与工作区资料，检查联系、矛盾、盲点、反例和下一步问题。",
    content,
    filePath: new URL("../prompts/skills/deep-insight.zh.md", import.meta.url).pathname,
    modelPurpose: "agent.deep_insight",
    allowedTools: ["read_current_context", "content_search", "content_read"],
  }];
}
