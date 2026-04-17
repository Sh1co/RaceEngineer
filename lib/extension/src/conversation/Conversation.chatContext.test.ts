import fs from "node:fs/promises";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AIClient } from "../ai/AIClient";
import { Logger } from "../logger";
import {
  __resetVSCodeConfig,
  __setVSCodeConfig,
  __setWorkspaceFolder,
} from "../test/vscode.mock";
import { parseRubberduckTemplateOrThrow } from "./template/parseRubberduckTemplate";
import * as readFileContentModule from "../vscode/readFileContent";
import { Conversation } from "./Conversation";

const loggerMock: Logger = {
  setLevel: vi.fn(),
  debug: vi.fn(),
  log: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

async function loadChatTemplateMarkdown() {
  const templatePath = path.resolve(
    process.cwd(),
    "..",
    "..",
    "template",
    "chat",
    "chat-en.rdt.md"
  );
  return fs.readFile(templatePath, "utf8");
}

describe("chat-en template repo context integration", () => {
  beforeEach(() => {
    __resetVSCodeConfig();
    __setVSCodeConfig("raceengineer", "provider", "Ollama");
    __setWorkspaceFolder("C:\\repo");
    vi.clearAllMocks();
  });

  it("declares repo context + retrieval augmentation in template", async () => {
    const templateMarkdown = await loadChatTemplateMarkdown();
    const template = parseRubberduckTemplateOrThrow(templateMarkdown);

    const hasOpenFilesContextVariable =
      template.variables?.some(
        (variable) =>
          variable.name === "openFiles" && variable.type === "context"
      ) ?? false;

    expect(hasOpenFilesContextVariable).toBe(true);
    expect(template.response.retrievalAugmentation).toBeDefined();
    expect(template.response.retrievalAugmentation?.source).toBe(
      "embedding-file"
    );
    expect(template.response.retrievalAugmentation?.file).toBe(
      "raceengineer-repository.json"
    );
  });

  it("injects repository search results into chat prompt and activates embeddings", async () => {
    const readFileContentMock = vi
      .spyOn(readFileContentModule, "readFileContent")
      .mockResolvedValue(
        JSON.stringify({
          version: 0,
          embedding: {
            source: "ollama",
            model: "nomic-embed-text",
          },
          chunks: [
            {
              file: "lib/extension/src/autocomplete/sanitizeAutoCompleteResponse.ts",
              start_position: 1,
              end_position: 20,
              content: "const KNOWN_PLACEHOLDER_SNIPPETS = [\"obj['SUF']\"]",
              embedding: [1, 0, 0],
            },
          ],
        })
      );

    const generateEmbedding = vi.fn().mockResolvedValue({
      type: "success" as const,
      embedding: [1, 0, 0],
      totalTokenCount: 12,
    });

    const streamText = vi.fn().mockImplementation(async ({ prompt }) => {
      if (prompt.includes("Create a very short chat title")) {
        return (async function* () {
          yield "Placeholder leak sanitizer";
        })();
      }

      return (async function* () {
        yield "Found in sanitizeAutoCompleteResponse.";
      })();
    });

    const ai = {
      getEmbeddingConfiguration() {
        return { source: "ollama", model: "nomic-embed-text" };
      },
      isFileEditingEnabled() {
        return false;
      },
      isWebSearchEnabled() {
        return false;
      },
      async searchWeb() {
        return [];
      },
      generateEmbedding,
      streamText,
    } as unknown as AIClient;

    const templateMarkdown = await loadChatTemplateMarkdown();
    const template = parseRubberduckTemplateOrThrow(templateMarkdown);

    const conversation = new Conversation({
      id: "conversation-1",
      ai,
      template,
      initVariables: {
        openFiles: [
          {
            name: "C:\\repo\\lib\\extension\\src\\autocomplete\\sanitizeAutoCompleteResponse.ts",
            language: "typescript",
            content: "export function sanitizeAutoCompleteResponse() {}",
          },
        ],
        selectedText: "",
      },
      updateChatPanel: async () => {},
      diffEditorManager: {
        createDiffEditor: vi.fn(),
      } as any,
      diffData: undefined,
      logger: loggerMock,
    });

    await conversation.answer(
      "Find where autocomplete sanitizes obj['SUF'] placeholder leaks."
    );

    expect(readFileContentMock).toHaveBeenCalled();
    expect(generateEmbedding).toHaveBeenCalledTimes(1);
    expect(generateEmbedding).toHaveBeenCalledWith({
      input: "Find where autocomplete sanitizes obj['SUF'] placeholder leaks.",
    });
    expect(streamText).toHaveBeenCalledTimes(2);

    const chatPrompt = streamText.mock.calls[0]?.[0]?.prompt as string;
    const titlePrompt = streamText.mock.calls[1]?.[0]?.prompt as string;

    expect(chatPrompt).toContain("Open Files Context");
    expect(chatPrompt).toContain("sanitizeAutoCompleteResponse.ts");
    expect(chatPrompt).toContain("Repository Search Results");
    expect(chatPrompt).toContain("KNOWN_PLACEHOLDER_SNIPPETS");
    expect(titlePrompt).toContain("Create a very short chat title");

    const webviewConversation = await conversation.toWebviewConversation();
    expect(webviewConversation.header.title).toBe("Placeholder leak sanitizer");
    expect(webviewConversation.header.isTitleMessage).toBe(false);
    if (webviewConversation.content.type === "messageExchange") {
      const firstMessage = webviewConversation.content.messages[0];
      expect(firstMessage?.author).toBe("user");
      expect(firstMessage?.content).toContain(
        "Find where autocomplete sanitizes obj['SUF']"
      );
    }
  });

  it("answers repo question from mock repository context and avoids no-context fallback", async () => {
    __setWorkspaceFolder("C:\\mock-repo");

    const readFileContentMock = vi
      .spyOn(readFileContentModule, "readFileContent")
      .mockResolvedValue(
        JSON.stringify({
          version: 0,
          embedding: {
            source: "ollama",
            model: "nomic-embed-text",
          },
          chunks: [
            {
              file: "lib/extension/src/autocomplete/sanitizeAutoCompleteResponse.ts",
              start_position: 1,
              end_position: 40,
              content: "const KNOWN_PLACEHOLDER_SNIPPETS = [\"obj['SUF']\", \"obj['middle_code']\"]",
              embedding: [1, 0, 0],
            },
            {
              file: "lib/extension/src/chat/ChatModel.ts",
              start_position: 1,
              end_position: 20,
              content: "class ChatModel {}",
              embedding: [0, 1, 0],
            },
          ],
        })
      );

    const generateEmbedding = vi.fn().mockResolvedValue({
      type: "success" as const,
      embedding: [1, 0, 0],
      totalTokenCount: 9,
    });

    const streamText = vi.fn().mockImplementation(async ({ prompt }) => {
      const hasRelevantChunk = prompt.includes("KNOWN_PLACEHOLDER_SNIPPETS");
      const hasQuestion = prompt.includes("obj['SUF']");
      const isTitlePrompt = prompt.includes("Create a very short chat title");

      return (async function* () {
        if (isTitlePrompt) {
          yield "Placeholder sanitization lookup";
          return;
        }
        if (hasRelevantChunk && hasQuestion) {
          yield "Match found in lib/extension/src/autocomplete/sanitizeAutoCompleteResponse.ts.";
          return;
        }
        yield "I still do not have access to the repository link, file path, or code context.";
      })();
    });

    const ai = {
      getEmbeddingConfiguration() {
        return { source: "ollama", model: "nomic-embed-text" };
      },
      isFileEditingEnabled() {
        return false;
      },
      isWebSearchEnabled() {
        return false;
      },
      async searchWeb() {
        return [];
      },
      generateEmbedding,
      streamText,
    } as unknown as AIClient;

    const templateMarkdown = await loadChatTemplateMarkdown();
    const template = parseRubberduckTemplateOrThrow(templateMarkdown);

    const conversation = new Conversation({
      id: "conversation-2",
      ai,
      template,
      initVariables: {
        openFiles: [],
        selectedText: "",
      },
      updateChatPanel: async () => {},
      diffEditorManager: {
        createDiffEditor: vi.fn(),
      } as any,
      diffData: undefined,
      logger: loggerMock,
    });

    await conversation.answer(
      "Find where autocomplete sanitizes obj['SUF'] and obj['middle_code']."
    );

    expect(generateEmbedding).toHaveBeenCalledTimes(1);
    expect(readFileContentMock).toHaveBeenCalled();

    const readUri = readFileContentMock.mock.calls[0]?.[0] as { fsPath?: string };
    expect(readUri?.fsPath).toContain(
      "C:\\mock-repo\\.raceengineer\\embedding\\raceengineer-repository.json"
    );

    const streamTextInput = streamText.mock.calls[0]?.[0];
    const prompt = streamTextInput?.prompt as string;
    expect(prompt).toContain("Repository Search Results");
    expect(prompt).toContain("KNOWN_PLACEHOLDER_SNIPPETS");
    expect(streamText).toHaveBeenCalledTimes(2);

    const webviewConversation = await conversation.toWebviewConversation();
    expect(webviewConversation.content.type).toBe("messageExchange");
    if (webviewConversation.content.type === "messageExchange") {
      const botMessages = webviewConversation.content.messages.filter(
        (message) => message.author === "bot"
      );
      expect(botMessages.at(-1)?.content).toContain(
        "lib/extension/src/autocomplete/sanitizeAutoCompleteResponse.ts"
      );
      expect(botMessages.at(-1)?.content).not.toContain(
        "I still do not have access to the repository"
      );
    }
    expect(webviewConversation.header.title).toBe(
      "Placeholder sanitization lookup"
    );
  });

  it("injects web search results into prompt when web search toggle is enabled", async () => {
    __setWorkspaceFolder("C:\\mock-repo");
    __setVSCodeConfig("raceengineer", "chat.enableWebSearch", true);

    vi.spyOn(readFileContentModule, "readFileContent").mockResolvedValue(
      JSON.stringify({
        version: 0,
        embedding: {
          source: "ollama",
          model: "nomic-embed-text",
        },
        chunks: [],
      })
    );

    const generateEmbedding = vi.fn().mockResolvedValue({
      type: "success" as const,
      embedding: [1, 0, 0],
      totalTokenCount: 5,
    });

    const searchWeb = vi.fn().mockResolvedValue([
      {
        title: "Telemetry basics",
        url: "https://example.com/telemetry",
        snippet: "Telemetry in motorsport overview.",
      },
    ]);

    const streamText = vi.fn().mockImplementation(async ({ prompt }) => {
      return (async function* () {
        if (prompt.includes("Create a very short chat title")) {
          yield "Telemetry question";
          return;
        }
        yield "Using web context.";
      })();
    });

    const ai = {
      getEmbeddingConfiguration() {
        return { source: "ollama", model: "nomic-embed-text" };
      },
      isFileEditingEnabled() {
        return false;
      },
      isWebSearchEnabled() {
        return true;
      },
      searchWeb,
      generateEmbedding,
      streamText,
    } as unknown as AIClient;

    const templateMarkdown = await loadChatTemplateMarkdown();
    const template = parseRubberduckTemplateOrThrow(templateMarkdown);

    const conversation = new Conversation({
      id: "conversation-3",
      ai,
      template,
      initVariables: {
        openFiles: [],
        selectedText: "",
      },
      updateChatPanel: async () => {},
      diffEditorManager: {
        createDiffEditor: vi.fn(),
      } as any,
      diffData: undefined,
      logger: loggerMock,
    });

    await conversation.answer("Explain current telemetry best practices.");

    expect(searchWeb).toHaveBeenCalledTimes(1);
    expect(searchWeb).toHaveBeenCalledWith({
      query: "Explain current telemetry best practices.",
      maxResults: 5,
    });

    const prompt = streamText.mock.calls[0]?.[0]?.prompt as string;
    expect(prompt).toContain("## Web Search Results");
    expect(prompt).toContain("https://example.com/telemetry");
  });

  it("falls back to first user message title when AI title summary is empty", async () => {
    __setWorkspaceFolder("C:\\mock-repo");

    vi.spyOn(readFileContentModule, "readFileContent").mockResolvedValue(
      JSON.stringify({
        version: 0,
        embedding: {
          source: "ollama",
          model: "nomic-embed-text",
        },
        chunks: [],
      })
    );

    const generateEmbedding = vi.fn().mockResolvedValue({
      type: "success" as const,
      embedding: [1, 0, 0],
      totalTokenCount: 3,
    });

    const streamText = vi.fn().mockImplementation(async ({ prompt }) => {
      return (async function* () {
        if (prompt.includes("Create a very short chat title")) {
          yield "";
          return;
        }
        yield "Answer body";
      })();
    });

    const ai = {
      getEmbeddingConfiguration() {
        return { source: "ollama", model: "nomic-embed-text" };
      },
      isFileEditingEnabled() {
        return false;
      },
      isWebSearchEnabled() {
        return false;
      },
      async searchWeb() {
        return [];
      },
      generateEmbedding,
      streamText,
    } as unknown as AIClient;

    const templateMarkdown = await loadChatTemplateMarkdown();
    const template = parseRubberduckTemplateOrThrow(templateMarkdown);

    const conversation = new Conversation({
      id: "conversation-5",
      ai,
      template,
      initVariables: {
        openFiles: [],
        selectedText: "",
      },
      updateChatPanel: async () => {},
      diffEditorManager: {
        createDiffEditor: vi.fn(),
      } as any,
      diffData: undefined,
      logger: loggerMock,
    });

    await conversation.answer("Please explain race telemetry basics today");

    const webviewConversation = await conversation.toWebviewConversation();
    expect(webviewConversation.header.title).toBe(
      "Please explain race telemetry basics today"
    );
  });

  it("applies file rewrite blocks when file editing toggle is enabled", async () => {
    __setWorkspaceFolder("C:\\mock-repo");

    vi.spyOn(readFileContentModule, "readFileContent").mockResolvedValue(
      JSON.stringify({
        version: 0,
        embedding: {
          source: "ollama",
          model: "nomic-embed-text",
        },
        chunks: [],
      })
    );

    const writeFileMock = vi
      .spyOn(fs, "writeFile")
      .mockResolvedValue(undefined as never);
    const mkdirMock = vi
      .spyOn(fs, "mkdir")
      .mockResolvedValue(undefined as never);

    const generateEmbedding = vi.fn().mockResolvedValue({
      type: "success" as const,
      embedding: [1, 0, 0],
      totalTokenCount: 3,
    });

    const streamText = vi.fn().mockImplementation(async ({ prompt }) => {
      return (async function* () {
        if (prompt.includes("Create a very short chat title")) {
          yield "File edit test";
          return;
        }
        yield [
          '<file_edit path="lib/example.ts">',
          "```ts",
          "export const answer = 42;",
          "```",
          "</file_edit>",
          "",
          "Updated file.",
        ].join("\n");
      })();
    });

    const ai = {
      getEmbeddingConfiguration() {
        return { source: "ollama", model: "nomic-embed-text" };
      },
      isFileEditingEnabled() {
        return true;
      },
      isWebSearchEnabled() {
        return false;
      },
      async searchWeb() {
        return [];
      },
      generateEmbedding,
      streamText,
    } as unknown as AIClient;

    const templateMarkdown = await loadChatTemplateMarkdown();
    const template = parseRubberduckTemplateOrThrow(templateMarkdown);

    const conversation = new Conversation({
      id: "conversation-4",
      ai,
      template,
      initVariables: {
        openFiles: [],
        selectedText: "",
      },
      updateChatPanel: async () => {},
      diffEditorManager: {
        createDiffEditor: vi.fn(),
      } as any,
      diffData: undefined,
      logger: loggerMock,
    });

    await conversation.answer("Please update lib/example.ts");

    expect(mkdirMock).toHaveBeenCalled();
    expect(writeFileMock).toHaveBeenCalledWith(
      "C:\\mock-repo\\lib\\example.ts",
      "export const answer = 42;",
      "utf8"
    );

    const webviewConversation = await conversation.toWebviewConversation();
    expect(webviewConversation.content.type).toBe("messageExchange");
    if (webviewConversation.content.type === "messageExchange") {
      const botMessages = webviewConversation.content.messages.filter(
        (message) => message.author === "bot"
      );
      expect(botMessages.at(-1)?.content).toContain("Applied file edits:");
      expect(botMessages.at(-1)?.content).toContain("lib/example.ts");
    }
  });
});
