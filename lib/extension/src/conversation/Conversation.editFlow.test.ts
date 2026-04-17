import { beforeEach, describe, expect, it, vi } from "vitest";
import { AIClient } from "../ai/AIClient";
import { Logger } from "../logger";
import { __resetVSCodeConfig, __setVSCodeConfig } from "../test/vscode.mock";
import { Conversation } from "./Conversation";
import { RubberduckTemplate } from "./template/RubberduckTemplate";

const loggerMock: Logger = {
  setLevel: vi.fn(),
  debug: vi.fn(),
  log: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

describe("Conversation edit flow", () => {
  beforeEach(() => {
    __resetVSCodeConfig();
    __setVSCodeConfig("raceengineer", "provider", "Ollama");
    vi.clearAllMocks();
  });

  it("produces diff output and marks edit as generated", async () => {
    const streamText = vi.fn().mockResolvedValue(
      (async function* () {
        yield "const sum = (a, b) => {\n  return a + b;\n};";
      })()
    );

    const ai = {
      isFileEditingEnabled() {
        return false;
      },
      isWebSearchEnabled() {
        return false;
      },
      async searchWeb() {
        return [];
      },
      streamText,
    } as unknown as AIClient;

    const updateDiffMock = vi.fn().mockResolvedValue(undefined);
    const onDidReceiveMessageMock = vi.fn();

    const conversationTemplate: RubberduckTemplate = {
      id: "edit-code-test",
      engineVersion: 0,
      label: "Edit Code",
      description: "Test edit flow",
      header: {
        title: "Edit Code",
        useFirstMessageAsTitle: false,
        icon: {
          type: "codicon",
          value: "edit",
        },
      },
      response: {
        maxTokens: 1024,
        completionHandler: {
          type: "active-editor-diff",
        },
        template: "Apply requested edits",
      },
    };

    const originalContent =
      "const sum = (a, b) => {\n  return a - b;\n};\nconsole.log(sum(1, 2));\n";
    const selectedText = "const sum = (a, b) => {\n  return a - b;\n};";

    const conversation = new Conversation({
      id: "conversation-edit",
      ai,
      template: conversationTemplate,
      initVariables: {},
      updateChatPanel: async () => {},
      diffEditorManager: {
        createDiffEditor: vi.fn().mockReturnValue({
          onDidReceiveMessage: onDidReceiveMessageMock,
          updateDiff: updateDiffMock,
        }),
      } as any,
      diffData: {
        filename: "math.ts",
        selectedText,
        range: {
          start: { line: 0, character: 0 },
          end: { line: 2, character: 2 },
        } as any,
        language: "typescript",
        editor: {
          viewColumn: 1,
          document: {
            uri: { fsPath: "C:\\repo\\math.ts" },
            languageId: "typescript",
            getText: () => originalContent,
            offsetAt: (position: { line: number; character: number }) => {
              const lines = originalContent.split("\n");
              let offset = 0;
              for (let i = 0; i < position.line; i += 1) {
                offset += (lines[i]?.length ?? 0) + 1;
              }
              return offset + position.character;
            },
          },
        } as any,
      },
      logger: loggerMock,
    });

    await conversation.answer("Please fix sum function to add numbers.");

    expect(streamText).toHaveBeenCalledTimes(1);
    expect(updateDiffMock).toHaveBeenCalledTimes(2);
    expect(onDidReceiveMessageMock).toHaveBeenCalledTimes(1);

    const diffPayload = updateDiffMock.mock.calls.at(-1)?.[0];
    expect(diffPayload.oldCode).toContain("return a - b;");
    expect(diffPayload.newCode).toContain("return a + b;");

    const webviewConversation = await conversation.toWebviewConversation();
    expect(webviewConversation.content.type).toBe("messageExchange");
    if (webviewConversation.content.type === "messageExchange") {
      const botMessages = webviewConversation.content.messages.filter(
        (message) => message.author === "bot"
      );
      expect(botMessages.at(-1)?.content).toBe("Edit generated");
      if (webviewConversation.content.state.type === "userCanReply") {
        expect(
          webviewConversation.content.state.responsePlaceholder
        ).toContain("Describe how you want to change the code");
      }
    }
  });
});
