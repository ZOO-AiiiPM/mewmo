export type ActorSource = "web" | "internal-agent" | "mcp" | "workflow" | "feed-ingestion";

export interface Actor {
  userId: string;
  source: ActorSource;
  clientId?: string;
  scopes: readonly string[];
}

export function createActor(input: Actor): Actor {
  if (!input.userId.trim()) throw new Error("actor userId is required");
  return { ...input, userId: input.userId.trim() };
}
