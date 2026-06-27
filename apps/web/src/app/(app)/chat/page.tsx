"use client";

import { useState } from "react";
import { TopBar } from "../../../components/shell/TopBar";
import { generateChatMessages } from "../../../lib/mock-data";

const initialMessages = generateChatMessages(20);

export default function ChatPage() {
  const [messages] = useState(initialMessages);
  const [input, setInput] = useState("");

  return (
    <div className="flex flex-col h-screen">
      <TopBar title="AI Chat" />

      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[70%] rounded-lg px-4 py-3 text-sm leading-relaxed ${
                msg.role === "user"
                  ? "bg-moss text-white"
                  : "bg-paper-2 border border-line text-ink"
              }`}
            >
              {msg.content.split("\n").map((line, i) => (
                <span key={i}>
                  {line}
                  {i < msg.content.split("\n").length - 1 && <br />}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-line p-4">
        <div className="flex gap-2 max-w-3xl mx-auto">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask mewmo AI anything..."
            className="flex-1 rounded-md border border-line bg-paper px-4 py-2.5 text-sm text-ink placeholder:text-muted outline-none focus:border-moss"
          />
          <button className="px-4 py-2.5 rounded-md bg-moss text-white text-sm font-medium hover:bg-moss/90 transition-colors">
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
