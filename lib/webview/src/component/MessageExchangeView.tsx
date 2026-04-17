import { webviewApi } from "@raceengineer/common";
import React, { useState } from "react";
import ReactMarkdown from "react-markdown";
import { ChatInput } from "./ChatInput";
import CodeBlock from "./CodeBlock";
import { ErrorMessage } from "./ErrorMessage";

export function MessageExchangeView({
  content,
  onClickDismissError,
  onClickRetry,
  onSendMessage,
}: {
  content: webviewApi.MessageExchangeContent;
  onSendMessage: (message: string) => void;
  onClickDismissError: () => void;
  onClickRetry: () => void;
}) {
  const [inputText, setInputText] = useState("");

  return (
    <div className="message-exchange">
      <div className="message-list">
        {content.messages.map((message, i) => (
          <div className={`message ${message.author}`} key={i}>
            {message.author === "user" && message.content}
            {message.author === "bot" && (
              <ReactMarkdown components={{ code: CodeBlock }}>
                {message.content}
              </ReactMarkdown>
            )}
          </div>
        ))}

        {content.state.type === "waitingForBotAnswer" && (
          <div className="message bot system">
            {content.state.botAction ?? ""}
            <span className={"in-progress"} />
          </div>
        )}

        {content.state.type === "botAnswerStreaming" && (
          <div className="message bot system">
            <ReactMarkdown components={{ code: CodeBlock }}>
              {content.state.partialAnswer ?? ""}
            </ReactMarkdown>
            <span className={"in-progress"} />
          </div>
        )}
      </div>

      {content.state.type === "userCanReply" && (
        <ChatInput
          placeholder={
            content.state.responsePlaceholder ??
            (content.messages.length > 0 ? "Reply..." : "Ask...")
          }
          text={inputText}
          onChange={setInputText}
          onSubmit={() => {
            onSendMessage(inputText);
            setInputText("");
          }}
        />
      )}

      {content.error && (
        <ErrorMessage
          error={content.error}
          onClickDismiss={onClickDismissError}
          onClickRetry={onClickRetry}
        />
      )}
    </div>
  );
}
