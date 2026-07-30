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
    _count?: { sessionEntries?: number; messages?: number };
  };
  const messageCount = (chat._count?.sessionEntries ?? 0) + (chat._count?.messages ?? 0);
  return { id: chat.id, title: chat.title, createdAt: chat.createdAt, updatedAt: chat.updatedAt, messageCount };
}
