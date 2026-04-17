import { describe, expect, it, vi } from "vitest";
import {
  AutoCompletePromptTemplateProvider,
  AutoCompleteStrategy,
} from "./AutoCompleteTemplateProvider";
import { Logger } from "../logger";

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

function getPrompt(strategy: AutoCompleteStrategy): string {
  if (strategy.type !== "prompt") {
    throw new Error("Expected prompt strategy");
  }
  return strategy.prompt;
}

describe("AutoCompletePromptTemplateProvider", () => {
  it("uses deepseek prompt strategy with deepseek FIM tokens", () => {
    const provider = new AutoCompletePromptTemplateProvider({ logger });
    const strategy = provider.getAutoCompleteStrategy("deepseek-coder:1.3b", {
      provider: "Ollama",
      additionalContext: "// ctx",
      prefix: "const x = ",
      suffix: ";",
    });

    expect(strategy.type).toBe("prompt");
    expect(getPrompt(strategy)).toContain("<｜fim▁begin｜>");
    expect(getPrompt(strategy)).toContain("<｜fim▁hole｜>");
    expect(getPrompt(strategy)).toContain("<｜fim▁end｜>");
  });

  it("uses stable-code prompt strategy", () => {
    const provider = new AutoCompletePromptTemplateProvider({ logger });
    const strategy = provider.getAutoCompleteStrategy("stable-code:3b-code", {
      provider: "Ollama",
      additionalContext: "// ctx",
      prefix: "const x = ",
      suffix: ";",
    });

    expect(strategy.type).toBe("prompt");
    expect(getPrompt(strategy)).toContain("<fim_prefix>");
    expect(getPrompt(strategy)).toContain("<fim_suffix>");
    expect(getPrompt(strategy)).toContain("<fim_middle>");
  });

  it("uses codellama-style default prompt strategy", () => {
    const provider = new AutoCompletePromptTemplateProvider({ logger });
    const strategy = provider.getAutoCompleteStrategy("codellama:7b", {
      provider: "Ollama",
      additionalContext: "// ctx",
      prefix: "const x = ",
      suffix: ";",
    });

    expect(strategy.type).toBe("prompt");
    expect(getPrompt(strategy)).toContain("<PRE>");
    expect(getPrompt(strategy)).toContain("<SUF>");
    expect(getPrompt(strategy)).toContain("<MID>");
  });

  it("uses qwen infill strategy on Ollama", () => {
    const provider = new AutoCompletePromptTemplateProvider({ logger });
    const strategy = provider.getAutoCompleteStrategy("qwen2.5-coder:1.5b", {
      provider: "Ollama",
      additionalContext: "// ctx",
      prefix: "const x = ",
      suffix: ";",
    });

    expect(strategy.type).toBe("infill");
    if (strategy.type === "infill") {
      expect(strategy.prefix).toBe("const x = ");
      expect(strategy.suffix).toBe(";");
    }
  });

  it("falls back to qwen token prompt strategy on non-Ollama provider", () => {
    const warn = vi.fn();
    const provider = new AutoCompletePromptTemplateProvider({
      logger: {
        ...logger,
        warn,
      },
    });
    const strategy = provider.getAutoCompleteStrategy("qwen2.5-coder:1.5b", {
      provider: "llama.cpp",
      additionalContext: "// ctx",
      prefix: "const x = ",
      suffix: ";",
    });

    expect(strategy.type).toBe("prompt");
    expect(getPrompt(strategy)).toContain("<|fim_prefix|>");
    expect(getPrompt(strategy)).toContain("<|fim_suffix|>");
    expect(getPrompt(strategy)).toContain("<|fim_middle|>");
    expect(warn).toHaveBeenCalledOnce();
  });
});
