"use client";

import { AgentSidebar } from "../../../components/agent/AgentSidebar";
import { ChatSwitcher } from "../../../components/agent/ChatSwitcher";
import { PrototypeIcon } from "../../../components/shell/PrototypeIcon";
import { useAgentChats } from "../../../lib/agent/use-agent-chats";

/**
 * mew home: a full-width agent conversation surface. Shares the exact data
 * layer and transcript components with the AI sidebar's agent tab, minus the
 * "current page" context (there is no page being read here).
 */
export default function MewHomePage() {
  const agentChats = useAgentChats();

  return (
    <div className="mewmo-agent-home">
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
        <AgentSidebar
          agentChats={agentChats}
          context={null}
          requestedSkill={null}
          showInsight={false}
          onSkillConsumed={() => {}}
          onDeepInsight={() => {}}
        />
      </div>
    </div>
  );
}
