import { webviewApi } from "@raceengineer/common";
import React from "react";

export const ConversationHeader: React.FC<{
  conversation: webviewApi.Conversation;
  onIconClick?: () => void;
}> = ({ conversation, onIconClick }) => {
  const title = conversation.header.title.trim();

  return (
    <div className="header conversation-title">
      <div className="conversation-title-main">
        <i className={`codicon codicon-${conversation.header.codicon} inline`} />
        <span className="conversation-title-text">{title}</span>
      </div>
      {onIconClick && (
        <span className="conversation-title-action">
          <i
            className="codicon codicon-eye inline"
            title="Insert prompt into editor"
            onClick={onIconClick}
          />
        </span>
      )}
    </div>
  );
};
