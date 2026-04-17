import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Logger } from "../logger";
import {
  __resetVSCodeConfig,
  __setVSCodeConfig,
} from "../test/vscode.mock";
import { AIClient } from "./AIClient";

const logger: Logger = {
  setLevel() {
    return;
  },
  debug() {
    return;
  },
  log() {
    return;
  },
  warn() {
    return;
  },
  error() {
    return;
  },
};

function createClient() {
  return new AIClient({
    apiKeyManager: {} as any,
    logger,
  });
}

function streamFromLines(lines: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const line of lines) {
        controller.enqueue(encoder.encode(`${line}\n`));
      }
      controller.close();
    },
  });
}

async function collectStreamText(stream: AsyncIterable<string>) {
  let all = "";
  for await (const chunk of stream) {
    all += chunk;
  }
  return all;
}

describe("AIClient chat/embedding integration", () => {
  beforeEach(() => {
    __resetVSCodeConfig();
    __setVSCodeConfig("raceengineer", "provider", "Ollama");
    __setVSCodeConfig("raceengineer", "providerBaseUrl", "http://localhost:11434");
    __setVSCodeConfig("raceengineer", "model", "custom");
    __setVSCodeConfig("raceengineer", "customModel", "qwen3.5:9b");
    __setVSCodeConfig("raceengineer", "chat.enableThinking", false);
    __setVSCodeConfig("raceengineer", "chat.enableWebSearch", false);
    __setVSCodeConfig("raceengineer.embedding", "model", "nomic-embed-text");
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("uses native Ollama /api/chat for qwen3.x and strips thinking chunks", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      body: streamFromLines([
        JSON.stringify({ message: { content: "Hello " }, thinking: "..." }),
        JSON.stringify({ message: { content: "World" } }),
        JSON.stringify({ done: true, total_duration: 10 }),
      ]),
    });
    vi.stubGlobal("fetch", fetchMock);

    const ai = createClient();
    const stream = await ai.streamText({
      prompt: "Say hello",
      maxTokens: 32,
      stop: ["<END>"],
      temperature: 0.2,
    });
    const text = await collectStreamText(stream);

    expect(text).toBe("Hello World");
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[0]).toBe("http://localhost:11434/api/chat");

    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(request.body));
    expect(body.model).toBe("qwen3.5:9b");
    expect(body.think).toBe(false);
    expect(body.stream).toBe(true);
    expect(body.options.num_predict).toBe(32);
    expect(body.options.temperature).toBe(0.2);
    expect(body.options.stop).toEqual(["<END>"]);
  });

  it("passes thinking toggle when enabled", async () => {
    __setVSCodeConfig("raceengineer", "chat.enableThinking", true);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      body: streamFromLines([JSON.stringify({ done: true })]),
    });
    vi.stubGlobal("fetch", fetchMock);

    const ai = createClient();
    await ai.streamText({
      prompt: "hello",
      maxTokens: 8,
    });

    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(request.body));
    expect(body.think).toBe(true);
  });

  it("reads web search toggle from settings", () => {
    const ai = createClient();
    expect(ai.isWebSearchEnabled()).toBe(false);

    __setVSCodeConfig("raceengineer", "chat.enableWebSearch", true);
    expect(ai.isWebSearchEnabled()).toBe(true);
  });

  it("queries duckduckgo and extracts normalized web results", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        Heading: "Race Engineer",
        AbstractText: "Race engineering discipline overview.",
        AbstractURL: "https://example.com/overview",
        RelatedTopics: [
          {
            Text: "Telemetry analysis - Motorsport telemetry methods",
            FirstURL: "https://example.com/telemetry",
          },
          {
            Name: "Nested",
            Topics: [
              {
                Text: "Pit strategy - Decision making under uncertainty",
                FirstURL: "https://example.com/pit-strategy",
              },
            ],
          },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const ai = createClient();
    const results = await ai.searchWeb({
      query: "race engineer telemetry",
      maxResults: 2,
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[0]).toContain(
      "https://api.duckduckgo.com/"
    );
    expect(results).toEqual([
      {
        title: "Race Engineer",
        url: "https://example.com/overview",
        snippet: "Race engineering discipline overview.",
      },
      {
        title: "Telemetry analysis",
        url: "https://example.com/telemetry",
        snippet: "Telemetry analysis - Motorsport telemetry methods",
      },
    ]);
  });

  it("keeps legacy chat branch disabled for non-qwen models", async () => {
    __setVSCodeConfig("raceengineer", "model", "mistral:instruct");

    const ai = createClient();
    expect(ai.shouldUseNativeOllamaQwenChat()).toBe(false);
  });

  it("uses native Ollama /api/chat for non-qwen models when thinking is enabled", async () => {
    __setVSCodeConfig("raceengineer", "model", "mistral:instruct");
    __setVSCodeConfig("raceengineer", "chat.enableThinking", true);

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      body: streamFromLines([JSON.stringify({ done: true })]),
    });
    vi.stubGlobal("fetch", fetchMock);

    const ai = createClient();
    await ai.streamText({
      prompt: "hello",
      maxTokens: 8,
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[0]).toBe("http://localhost:11434/api/chat");

    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(request.body));
    expect(body.model).toBe("mistral:instruct");
    expect(body.think).toBe(true);
  });

  it("uses native Ollama /api/embed and configured embedding model", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        embeddings: [[0.12, 0.34, 0.56]],
        prompt_eval_count: 7,
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const ai = createClient();
    const result = await ai.generateEmbedding({
      input: "hello embeddings",
    });

    expect(result.type).toBe("success");
    if (result.type === "success") {
      expect(result.embedding).toEqual([0.12, 0.34, 0.56]);
      expect(result.totalTokenCount).toBe(7);
    }

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "http://localhost:11434/api/embed"
    );

    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(request.body));
    expect(body.model).toBe("nomic-embed-text");
    expect(body.input).toBe("hello embeddings");
  });

  it("throws clear error when embedding requested on non-Ollama provider", async () => {
    __setVSCodeConfig("raceengineer", "provider", "llama.cpp");
    const ai = createClient();

    await expect(
      ai.generateEmbedding({
        input: "x",
      })
    ).rejects.toThrow(
      "Embedding generation requires raceengineer.provider to be set to Ollama."
    );
  });
});
