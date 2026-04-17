import { webviewApi } from "@raceengineer/common";
import React, { useState } from "react";
import { ExpandedConversationView } from "../component/ExpandedConversationView";
import { SendMessage } from "../vscode/SendMessage";

const StartChatButton: React.FC<{
  onClick: () => void;
}> = ({ onClick }) => (
  <div className="start-chat">
    <button onClick={onClick}>Start new chat</button>
  </div>
);

export const ChatPanelView: React.FC<{
  sendMessage: SendMessage;
  panelState: webviewApi.PanelState;
}> = ({ panelState, sendMessage }) => {
  const [isHistoryExpanded, setIsHistoryExpanded] = useState(false);

  if (panelState == null) {
    return (
      <StartChatButton onClick={() => sendMessage({ type: "startChat" })} />
    );
  }

  if (panelState.type !== "chat") {
    throw new Error(
      `Invalid panel state '${panelState.type}' (expected 'chat'))`
    );
  }

  if (panelState.conversations.length === 0) {
    return (
      <div className="chat-shell empty">
        <div className="chat-toolbar">
          <button
            className="toolbar-primary"
            onClick={() => sendMessage({ type: "startChat" })}
          >
            New Chat
          </button>
          <button
            className="toolbar-secondary"
            onClick={() => setIsHistoryExpanded((current) => !current)}
          >
            <i
              className={`codicon ${
                isHistoryExpanded ? "codicon-chevron-down" : "codicon-chevron-right"
              }`}
            />{" "}
            History
          </button>
        </div>
        <div className="chat-empty-state">
          <h3>RaceEngineer Chat</h3>
          <p>Start first conversation. History panel collapsed by default.</p>
          <StartChatButton onClick={() => sendMessage({ type: "startChat" })} />
        </div>
      </div>
    );
  }

  const conversations = [...panelState.conversations].reverse();

  const selectedConversation =
    conversations.find(
      (conversation) => conversation.id === panelState.selectedConversationId
    ) ?? conversations[0];

  const onSelectConversation = (conversationId: string) =>
    sendMessage({
      type: "clickCollapsedConversation",
      data: { id: conversationId },
    });

  if (selectedConversation == null) {
    return (
      <StartChatButton onClick={() => sendMessage({ type: "startChat" })} />
    );
  }

  return (
    <div className="chat-shell">
      <div className="chat-toolbar">
        <button
          className="toolbar-primary"
          onClick={() => sendMessage({ type: "startChat" })}
        >
          New Chat
        </button>
        <button
          className="toolbar-secondary"
          onClick={() => setIsHistoryExpanded((current) => !current)}
        >
          <i
            className={`codicon ${
              isHistoryExpanded ? "codicon-chevron-down" : "codicon-chevron-right"
            }`}
          />{" "}
          History
        </button>
      </div>

      {isHistoryExpanded && (
        <div className="chat-tabs-window">
          {conversations.map((conversation) => {
            const isActive = conversation.id === selectedConversation.id;
            return (
              <button
                key={conversation.id}
                className={`chat-tab ${isActive ? "active" : ""}`}
                onClick={() => onSelectConversation(conversation.id)}
                title={conversation.header.title}
              >
                <span className="chat-tab-title">{conversation.header.title}</span>
                <span className="chat-tab-icon">
                  <i className={`codicon codicon-${conversation.header.codicon}`} />
                </span>
              </button>
            );
          })}
        </div>
      )}

      <div className="chat-active-pane">
        <ExpandedConversationView
          key={selectedConversation.id}
          conversation={selectedConversation}
          onSendMessage={(message: string) =>
            sendMessage({
              type: "sendMessage",
              data: { id: selectedConversation.id, message },
            })
          }
          onClickRetry={() =>
            sendMessage({
              type: "retry",
              data: { id: selectedConversation.id },
            })
          }
          onClickDismissError={() =>
            sendMessage({
              type: "dismissError",
              data: { id: selectedConversation.id },
            })
          }
          onClickDelete={() =>
            sendMessage({
              type: "deleteConversation",
              data: { id: selectedConversation.id },
            })
          }
          onClickRebuildEmbedding={() =>
            sendMessage({
              type: "rebuildEmbedding",
            })
          }
          chatSettings={panelState.settings}
          onToggleThinking={(value) =>
            sendMessage({
              type: "setChatSetting",
              data: { key: "enableThinking", value },
            })
          }
          onToggleWebSearch={(value) =>
            sendMessage({
              type: "setChatSetting",
              data: { key: "enableWebSearch", value },
            })
          }
          onClickExport={() => {
            sendMessage({
              type: "exportConversation",
              data: { id: selectedConversation.id },
            });
          }}
          onClickInsertPrompt={
            panelState.surfacePromptForOpenAIPlus
              ? () => {
                  sendMessage({
                    type: "insertPromptIntoEditor",
                    data: { id: selectedConversation.id },
                  });
                }
              : undefined
          }
        />
      </div>
    </div>
  );
};
