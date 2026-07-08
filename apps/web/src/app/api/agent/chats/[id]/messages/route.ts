import { generateAgentReply, type AgentContextInput, type AgentHistoryMessage } from "@mewmo/ai";
import { createAiChatsRepository, getPrisma } from "@mewmo/db";
import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "../../../../../../lib/auth";

const messageSchema = z.object({
  content: z.string().trim().min(1).max(8000),
  context: z
    .object({
      targetType: z.enum(["note", "clip", "feed_entry"]),
      targetId: z.string().min(1),
    })
    .nullable()
    .optional(),
});

interface AgentMessageRecord {
  id: string;
  role: "user" | "assistant" | "tool";
  content: string;
  status?: string;
}

interface AgentChatRecord {
  id: string;
  messages?: AgentMessageRecord[];
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = messageSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { id } = await params;
  const repo = createAiChatsRepository();
  const chat = (await repo.findById(session.user.id, id)) as AgentChatRecord | null;
  if (!chat) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const resolvedContext = parsed.data.context
    ? await resolveAgentContext(session.user.id, parsed.data.context)
    : null;
  const history = buildHistory(chat.messages ?? []);
  const userMessage = (await repo.addMessage(id, {
    role: "user",
    content: parsed.data.content,
    status: "completed",
  })) as AgentMessageRecord;

  if (resolvedContext) {
    await repo.addContextAttachment(session.user.id, String(userMessage.id), resolvedContext);
  }

  const assistantMessage = (await repo.addMessage(id, {
    role: "assistant",
    content: "",
    status: "pending",
  })) as AgentMessageRecord;

  try {
    const content = await generateAgentReply({
      history,
      userMessage: parsed.data.content,
      context: resolvedContext,
    });

    await repo.updateMessage(id, String(assistantMessage.id), {
      content,
      status: "completed",
    });

    return NextResponse.json({
      userMessage,
      assistantMessage: { ...assistantMessage, content, status: "completed" },
    });
  } catch (error) {
    const content = "生成失败，请稍后重试。";
    await repo.updateMessage(id, String(assistantMessage.id), {
      content,
      status: "failed",
      metadata: { error: error instanceof Error ? error.message : "unknown_error" },
    });

    return NextResponse.json(
      { error: "Agent reply failed", userMessage, assistantMessage: { ...assistantMessage, content, status: "failed" } },
      { status: 502 },
    );
  }
}

function buildHistory(messages: AgentMessageRecord[]): AgentHistoryMessage[] {
  return messages
    .filter((message) => message.role === "user" || message.role === "assistant")
    .filter((message) => message.status !== "failed" && message.content.trim())
    .slice(-12)
    .map((message) => ({ role: message.role as "user" | "assistant", content: message.content }));
}

async function resolveAgentContext(
  userId: string,
  context: { targetType: "note" | "clip" | "feed_entry"; targetId: string },
): Promise<AgentContextInput | null> {
  const prisma = getPrisma();

  if (context.targetType === "clip") {
    const clip = await prisma.clip.findFirst({
      where: { id: context.targetId, userId, deletedAt: null },
      select: { id: true, title: true, url: true, summary: true, content: true },
    });
    if (!clip) return null;
    return {
      targetType: "clip",
      targetId: clip.id,
      title: clip.title,
      sourceUrl: clip.url,
      summarySnapshot: clip.summary,
      contentSnapshot: limitContext(clip.content),
    };
  }

  if (context.targetType === "feed_entry") {
    const entry = await prisma.feedEntry.findFirst({
      where: { id: context.targetId, userId, deletedAt: null },
      select: { id: true, title: true, url: true, summary: true, content: true },
    });
    if (!entry) return null;
    return {
      targetType: "feed_entry",
      targetId: entry.id,
      title: entry.title,
      sourceUrl: entry.url,
      summarySnapshot: entry.summary,
      contentSnapshot: limitContext(entry.content),
    };
  }

  const note = await prisma.note.findFirst({
    where: { id: context.targetId, userId, deletedAt: null },
    select: { id: true, slug: true, title: true, summary: true, content: true },
  });
  if (!note) return null;
  return {
    targetType: "note",
    targetId: note.id,
    title: note.title,
    sourceUrl: `/notes/${note.slug}`,
    summarySnapshot: note.summary,
    contentSnapshot: limitContext(note.content),
  };
}

function limitContext(content: string) {
  return content.length > 24000 ? `${content.slice(0, 24000)}\n\n[内容已截断]` : content;
}
