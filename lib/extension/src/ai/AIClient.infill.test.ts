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

describe("AIClient.generateInfillText", () => {
  beforeEach(() => {
    __resetVSCodeConfig();
    __setVSCodeConfig("privy", "provider", "Ollama");
    __setVSCodeConfig("privy", "providerBaseUrl", "http://localhost:11434");
    __setVSCodeConfig("privy.autocomplete", "model", "qwen2.5-coder:1.5b");
    __setVSCodeConfig("privy", "model", "mistral:instruct");
    vi.unstubAllGlobals();
  });

  it("sends infill request payload with suffix", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ response: "return a + b;" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const ai = createClient();
    const response = await ai.generateInfillText({
      prefix: "const sum = ",
      suffix: ";",
      maxTokens: 24,
    });

    expect(response).toBe("return a + b;");
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "http://localhost:11434/api/generate"
    );

    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const requestBody = JSON.parse(String(request.body));
    expect(requestBody.model).toBe("qwen2.5-coder:1.5b");
    expect(requestBody.prompt).toBe("const sum = ");
    expect(requestBody.suffix).toBe(";");
    expect(requestBody.stream).toBe(false);
    expect(requestBody.options.num_predict).toBe(24);
  });

  it("uses newline suffix fallback when suffix is empty", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ response: "return a + b;" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const ai = createClient();
    await ai.generateInfillText({
      prefix: "def calc_fib(n):\n    ",
      suffix: "",
      maxTokens: 64,
    });

    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const requestBody = JSON.parse(String(request.body));
    expect(requestBody.suffix).toBe("\n");
  });

  it("retries empty python EOF infill with return-hint suffix", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ response: "" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ response: "if n <= 1:\n        return n" }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const ai = createClient();
    const response = await ai.generateInfillText({
      prefix: "def calc_fib(n):\n    ",
      suffix: "",
      maxTokens: 64,
    });

    expect(response).toContain("return");
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const firstRequest = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const firstBody = JSON.parse(String(firstRequest.body));
    expect(firstBody.suffix).toBe("\n");

    const secondRequest = fetchMock.mock.calls[1]?.[1] as RequestInit;
    const secondBody = JSON.parse(String(secondRequest.body));
    expect(secondBody.suffix).toBe("\nreturn");
  });

  it("retries placeholder python EOF infill with return-hint suffix", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ response: "obj['SUF']" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ response: "if n <= 1:\n        return n" }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const ai = createClient();
    const response = await ai.generateInfillText({
      prefix: "def calc_fib(n):\n    ",
      suffix: "",
      maxTokens: 64,
    });

    expect(response).toContain("return");
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const firstRequest = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const firstBody = JSON.parse(String(firstRequest.body));
    expect(firstBody.suffix).toBe("\n");

    const secondRequest = fetchMock.mock.calls[1]?.[1] as RequestInit;
    const secondBody = JSON.parse(String(secondRequest.body));
    expect(secondBody.suffix).toBe("\nreturn");
  });

  it("rejects infill generation for non-Ollama provider", async () => {
    __setVSCodeConfig("privy", "provider", "llama.cpp");
    const ai = createClient();

    await expect(
      ai.generateInfillText({
        prefix: "const sum = ",
        suffix: ";",
      })
    ).rejects.toThrow(
      "Infill autocomplete is only supported when privy.provider is set to Ollama."
    );
  });

  it("propagates HTTP failures from infill endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({}),
    });
    vi.stubGlobal("fetch", fetchMock);
    const ai = createClient();

    await expect(
      ai.generateInfillText({
        prefix: "const sum = ",
        suffix: ";",
      })
    ).rejects.toThrow("Infill autocomplete request failed with status 500");
  });

  it("propagates model errors from infill endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ error: "model load failed" }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const ai = createClient();

    await expect(
      ai.generateInfillText({
        prefix: "const sum = ",
        suffix: ";",
      })
    ).rejects.toThrow("model load failed");
  });
});
