"use client";

import { useState } from "react";

import { AgentSidebar } from "../../../components/agent/AgentSidebar";
import { ChatSwitcher } from "../../../components/agent/ChatSwitcher";
import { PrototypeIcon } from "../../../components/shell/PrototypeIcon";
import { useAgentChats } from "../../../lib/agent/use-agent-chats";

const SUGGESTIONS = ["总结我最近的剪藏", "把今天的笔记整理成清单", "我的订阅里有什么值得读？"];

/**
 * mew home: a full-width agent conversation surface. Shares the exact data
 * layer and transcript components with the AI sidebar's agent tab, minus the
 * "current page" context (there is no page being read here).
 *
 * Empty sessions collapse into a centered hero (mark + invitation + suggestion
 * chips + input); once the first turn exists the normal transcript layout
 * takes over.
 */
export default function MewHomePage() {
  // Every visit lands on a fresh conversation (an untouched one is reused).
  const agentChats = useAgentChats({ startFresh: true });
  // Deep insight works here too — without page context it targets recent workspace content.
  const [requestedSkill, setRequestedSkill] = useState<string | null>(null);
  const sessionEmpty = agentChats.store.stableRows.length === 0 && agentChats.store.liveRow === null;
  const chatReady = agentChats.activeChatId !== null && !agentChats.loadingChats && agentChats.store.status !== "loading";

  const sendSuggestion = (content: string) => {
    if (!chatReady || agentChats.store.status === "sending") return;
    agentChats.store.send({ content, context: null });
  };

  return (
    <div className={`mewmo-agent-home ${sessionEmpty ? "mewmo-agent-home--empty" : ""}`}>
      <div className="mewmo-agent-home__column">
        <header className="mewmo-agent-home__head">
          <div className="mewmo-agent-home__brand">
            <PrototypeIcon name="mewmo-logo" size={22} />
            <span>mew</span>
          </div>
          <div className="mewmo-agent-home__actions">
            <ChatSwitcher
              chats={agentChats.chats}
              activeChatId={agentChats.activeChatId}
              loading={agentChats.loadingChats}
              locked={agentChats.store.status === "sending"}
              pendingChatId={agentChats.pendingChatId}
              onSelectChat={agentChats.selectChat}
              onRename={agentChats.renameChat}
              onClear={agentChats.clearChat}
              onDelete={agentChats.deleteChat}
            />
            <button
              type="button"
              className="mewmo-icon-button"
              onClick={() => void agentChats.newChat()}
              aria-label="新建会话"
              disabled={agentChats.loadingChats || agentChats.pendingChatId !== null || agentChats.store.status === "sending"}
            >
              <PrototypeIcon name="pen-new-square" size={17} />
            </button>
          </div>
        </header>
        {sessionEmpty && (
          <div className="mewmo-agent-home__hero">
            <div className="mewmo-agent-home__hero-mark">
              <PrototypeIcon name="cat" size={28} />
            </div>
            <h1 className="mewmo-agent-home__hero-title">想整理点什么？</h1>
            <p className="mewmo-agent-home__hero-note">
              <span>搜索、创建、润色、移动、归类，都交给 mew。</span>
              <span>写操作先出预览，你确认才执行。</span>
            </p>
            <div className="mewmo-agent-home__hero-chips">
              {SUGGESTIONS.map((text) => (
                <button key={text} type="button" className="mewmo-agent-home__chip" onClick={() => sendSuggestion(text)} disabled={!chatReady}>
                  {text}
                </button>
              ))}
            </div>
          </div>
        )}
        <AgentSidebar
          agentChats={agentChats}
          context={null}
          requestedSkill={requestedSkill}
          onSkillConsumed={() => setRequestedSkill(null)}
          onDeepInsight={() => setRequestedSkill("deep-insight")}
        />
      </div>
    </div>
  );
}
