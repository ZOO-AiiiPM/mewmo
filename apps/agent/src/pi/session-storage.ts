import { uuidv7, type ModelCost, type Usage } from "@earendil-works/pi-ai";
import { SessionError, type SessionMetadata, type SessionStorage, type SessionTreeEntry } from "@earendil-works/pi-agent-core";

import type { AgentActor } from "../contracts";
import type { ApplicationPort, SessionEntryRecord, SessionUsageInput } from "../ports";

interface MewmoSessionStorageOptions {
  application: ApplicationPort;
  actor: AgentActor;
  chatId: string;
  turnId: string;
  purpose: "agent.chat" | "agent.deep_insight";
  requestedProvider: string;
  requestedModel: string;
  pricingKnown: boolean;
  priceSnapshot?: ModelCost;
}

export class MewmoSessionStorage implements SessionStorage<SessionMetadata> {
  private readonly appended: SessionTreeEntry[] = [];

  constructor(private readonly options: MewmoSessionStorageOptions) {}

  async getMetadata() {
    const metadata = await this.options.application.sessions.metadata({ actor: this.options.actor, chatId: this.options.chatId });
    return { id: metadata.id, createdAt: metadata.createdAt };
  }

  async getLeafId() {
    return (await this.options.application.sessions.metadata({ actor: this.options.actor, chatId: this.options.chatId })).activeLeafId;
  }

  async setLeafId(leafId: string | null) {
    if (leafId && !(await this.getEntry(leafId))) throw new SessionError("not_found", `Entry ${leafId} not found`);
    await this.appendEntry({
      type: "leaf",
      id: await this.createEntryId(),
      parentId: await this.getLeafId(),
      timestamp: new Date().toISOString(),
      targetId: leafId,
    });
  }

  async createEntryId() {
    return uuidv7();
  }

  async appendEntry(entry: SessionTreeEntry) {
    const usage = usageForEntry(entry, this.options);
    const stored = await this.options.application.sessions.append({
      actor: this.options.actor,
      chatId: this.options.chatId,
      turnId: this.options.turnId,
      entry: toRecord(entry),
      ...(usage ? { usage } : {}),
    });
    this.appended.push(fromRecord(stored));
  }

  async getEntry(id: string) {
    const entry = await this.options.application.sessions.get({ actor: this.options.actor, chatId: this.options.chatId, entryId: id });
    return entry ? fromRecord(entry) : undefined;
  }

  async findEntries<TType extends SessionTreeEntry["type"]>(type: TType) {
    const entries = await this.options.application.sessions.list({ actor: this.options.actor, chatId: this.options.chatId, type });
    return entries.map(fromRecord) as Array<Extract<SessionTreeEntry, { type: TType }>>;
  }

  async getLabel(id: string) {
    const labels = await this.findEntries("label");
    return labels.filter((entry) => entry.targetId === id).at(-1)?.label?.trim() || undefined;
  }

  async getSessionName() {
    const entries = await this.findEntries("session_info");
    return entries.at(-1)?.name?.trim() || undefined;
  }

  async getSessionStats() {
    const entries = (await this.options.application.sessions.list({ actor: this.options.actor, chatId: this.options.chatId })).map(fromRecord);
    let messageCount = 0;
    let cachedTokens = 0;
    let uncachedTokens = 0;
    let totalTokens = 0;
    let costTotal = 0;
    for (const entry of entries) {
      if (entry.type === "message") messageCount += 1;
      const usage = entryUsage(entry);
      if (!usage) continue;
      cachedTokens += usage.cacheRead;
      uncachedTokens += usage.input + usage.cacheWrite;
      totalTokens += usage.totalTokens;
      costTotal += usage.cost.total;
    }
    return { messageCount, cachedTokens, uncachedTokens, totalTokens, costTotal };
  }

  async getPathToRootOrCompaction(leafId: string | null) {
    if (leafId === null) return [];
    const entries = (await this.options.application.sessions.list({ actor: this.options.actor, chatId: this.options.chatId })).map(fromRecord);
    const byId = new Map(entries.map((entry) => [entry.id, entry]));
    const path: SessionTreeEntry[] = [];
    let stopAtEntryId: string | null = null;
    let current = byId.get(leafId);
    if (!current) throw new SessionError("not_found", `Entry ${leafId} not found`);
    while (current) {
      path.unshift(current);
      if (stopAtEntryId !== null && current.id === stopAtEntryId) break;
      if (current.type === "compaction") {
        if (current.retainedTail) break;
        stopAtEntryId = current.firstKeptEntryId ?? null;
      }
      if (!current.parentId) break;
      const parent: SessionTreeEntry | undefined = byId.get(current.parentId);
      if (!parent) throw new SessionError("invalid_session", `Entry ${current.parentId} not found`);
      current = parent;
    }
    return path;
  }

  async getEntries(options?: { afterEntrySeq?: number; limit?: number }) {
    return (await this.options.application.sessions.list({
      actor: this.options.actor,
      chatId: this.options.chatId,
      ...(options?.afterEntrySeq === undefined ? {} : { afterEntrySeq: options.afterEntrySeq }),
      ...(options?.limit === undefined ? {} : { limit: options.limit }),
    })).map(fromRecord);
  }

  getAppendedMessageEntry(role: "user" | "assistant") {
    return this.appended.find((entry) => entry.type === "message" && entry.message.role === role);
  }
}

function toRecord(entry: SessionTreeEntry): Omit<SessionEntryRecord, "entrySeq"> {
  const { id, parentId, timestamp, type, ...payload } = entry;
  return { entryId: id, parentId, timestamp, type, payload };
}

function fromRecord(entry: SessionEntryRecord): SessionTreeEntry {
  if (typeof entry.payload !== "object" || entry.payload === null || Array.isArray(entry.payload)) {
    throw new SessionError("invalid_entry", `Session entry ${entry.entryId} payload is invalid`);
  }
  return { type: entry.type, id: entry.entryId, parentId: entry.parentId, timestamp: entry.timestamp, ...entry.payload } as SessionTreeEntry;
}

function entryUsage(entry: SessionTreeEntry): Usage | undefined {
  if (entry.type === "message" && entry.message.role === "assistant") return entry.message.usage;
  if (entry.type === "compaction" || entry.type === "branch_summary") return entry.usage;
  return undefined;
}

function usageForEntry(entry: SessionTreeEntry, options: MewmoSessionStorageOptions): SessionUsageInput | undefined {
  const usage = entryUsage(entry);
  if (!usage) return undefined;
  const assistant = entry.type === "message" && entry.message.role === "assistant" ? entry.message : undefined;
  return {
    purpose: options.purpose,
    operation: entry.type === "compaction" ? "agent.compaction" : entry.type === "branch_summary" ? "agent.branch_summary" : "agent.response",
    provider: assistant?.provider ?? options.requestedProvider,
    requestedModel: options.requestedModel,
    ...(assistant?.responseModel ? { responseModel: assistant.responseModel } : {}),
    inputTokens: usage.input,
    outputTokens: usage.output,
    ...(usage.reasoning === undefined ? {} : { reasoningTokens: usage.reasoning }),
    cacheReadTokens: usage.cacheRead,
    cacheWriteTokens: usage.cacheWrite,
    ...(options.pricingKnown ? { providerCostUsd: usage.cost.total } : {}),
    ...(options.priceSnapshot ? { priceSnapshot: options.priceSnapshot } : {}),
  };
}
