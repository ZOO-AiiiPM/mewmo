import { createAiChatsRepository } from "@mewmo/db";
import { NextResponse } from "next/server";

import { auth } from "../../../../../lib/auth";
import { agentError } from "../../../../../lib/agent-contract";

interface ChatMessageView {
  id: string;
  role: string;
  content: string;
  status?: string;
  createdAt?: Date | string;
}

interface ChatView {
  messages?: ChatMessageView[];
  [key: string]: unknown;
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(agentError("unauthorized", "请先登录。", false), { status: 401 });
  }

  const { id } = await params;
  const chat = await createAiChatsRepository().findById(session.user.id, id) as ChatView | null;
  if (!chat) {
    return NextResponse.json(agentError("chat_not_found", "会话不存在。", false), { status: 404 });
  }

  return NextResponse.json({
    chat: {
      ...chat,
      messages: Array.isArray(chat.messages)
        ? chat.messages.map((message) => ({
            id: message.id,
            role: message.role,
            content: message.content,
            status: message.status,
            createdAt: message.createdAt,
          }))
        : [],
    },
    pageInfo: { nextCursor: null },
  });
}
