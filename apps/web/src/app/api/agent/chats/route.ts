import { createAiChatsRepository } from "@mewmo/db";
import { NextResponse } from "next/server";
import { auth } from "../../../../lib/auth";
import { agentChatCreateSchema, agentError } from "../../../../lib/agent-contract";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(agentError("unauthorized", "请先登录。", false), { status: 401 });
  }

  const repo = createAiChatsRepository();
  const chats = await repo.findByUserId(session.user.id);
  return NextResponse.json({ chats: Array.isArray(chats) ? chats.map(toChatSummary) : [], pageInfo: { nextCursor: null } });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(agentError("unauthorized", "请先登录。", false), { status: 401 });
  }

  const parsed = agentChatCreateSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(agentError("invalid_request", "会话参数无效。", false), { status: 400 });
  }

  const repo = createAiChatsRepository();
  const chat = parsed.data.default
    ? await repo.findOrCreateDefault(session.user.id)
    : await repo.create(session.user.id, { title: parsed.data.title ?? "新会话" });

  return NextResponse.json({ chat: toChatView(chat) }, { status: parsed.data.default ? 200 : 201 });
}

function toChatView(value: unknown) {
  const chat = value as {
    id?: unknown;
    title?: unknown;
    createdAt?: unknown;
    updatedAt?: unknown;
    messages?: Array<{ id: string; turnId?: string; role: string; content: string; status?: string; createdAt?: unknown; metadata?: unknown; error?: unknown }>;
  };
  return {
    id: chat.id,
    title: chat.title,
    createdAt: chat.createdAt,
    updatedAt: chat.updatedAt,
    messages: Array.isArray(chat.messages)
      ? chat.messages.map((message) => ({
          id: message.id,
          turnId: message.turnId,
          role: message.role,
          content: message.content,
          status: message.status,
          createdAt: message.createdAt,
          metadata: message.metadata,
          error: message.error,
        }))
      : [],
  };
}

function toChatSummary(value: unknown) {
  const chat = value as {
    id?: unknown;
    title?: unknown;
    createdAt?: unknown;
    updatedAt?: unknown;
    preview?: unknown;
    _count?: { sessionEntries?: unknown; messages?: unknown };
  };
  const entryCount = typeof chat._count?.sessionEntries === "number" ? chat._count.sessionEntries : null;
  const messageCount = typeof chat._count?.messages === "number" ? chat._count.messages : null;
  return {
    id: chat.id,
    title: chat.title,
    createdAt: chat.createdAt,
    updatedAt: chat.updatedAt,
    // Additive field: total persisted messages, so the client can hide
    // never-used chats. Omitted when counts are unavailable.
    ...(entryCount !== null || messageCount !== null
      ? { messageCount: (entryCount ?? 0) + (messageCount ?? 0) }
      : {}),
    // Additive field: first user message text, used as a fallback list title
    // for chats still named the default "新会话". Omitted when unavailable.
    ...(typeof chat.preview === "string" && chat.preview ? { preview: chat.preview } : {}),
  };
}
