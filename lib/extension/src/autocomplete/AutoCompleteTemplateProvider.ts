import { Logger } from "../logger";

export type AIProvider = "llamafile" | "llama.cpp" | "Ollama" | "OpenAI";

export type AutoCompletePromptStrategy = {
  type: "prompt";
  prompt: string;
  stop: string[];
  maxTokens?: number;
};

export type AutoCompleteInfillStrategy = {
  type: "infill";
  prefix: string;
  suffix: string;
  stop?: string[];
  maxTokens?: number;
};

export type AutoCompleteStrategy =
  | AutoCompletePromptStrategy
  | AutoCompleteInfillStrategy;

const DEEPSEEK_FIM_BEGIN = "<\uFF5Cfim\u2581begin\uFF5C>";
const DEEPSEEK_FIM_HOLE = "<\uFF5Cfim\u2581hole\uFF5C>";
const DEEPSEEK_FIM_END = "<\uFF5Cfim\u2581end\uFF5C>";

const QWEN_FIM_PREFIX = "<|fim_prefix|>";
const QWEN_FIM_SUFFIX = "<|fim_suffix|>";
const QWEN_FIM_MIDDLE = "<|fim_middle|>";

export class AutoCompletePromptTemplateProvider {
  private readonly logger: Logger;

  constructor({ logger }: { logger: Logger }) {
    this.logger = logger;
  }

  public getAutoCompleteStrategy(
    model: string,
    {
      provider,
      additionalContext,
      suffix,
      prefix,
    }: {
      provider: AIProvider;
      additionalContext: string;
      suffix: string;
      prefix: string;
    }
  ): AutoCompleteStrategy {
    const prefixWithAdditionalContext =
      additionalContext.length > 0 ? `${additionalContext}\n${prefix}` : prefix;

    if (model.startsWith("qwen2.5-coder")) {
      if (provider === "Ollama") {
        return {
          type: "infill",
          prefix,
          suffix,
          maxTokens: 256,
        };
      }

      this.logger.warn(
        "Qwen autocomplete infill currently optimized for Ollama provider. Falling back to token-based prompt mode."
      );
      return {
        type: "prompt",
        prompt: `${QWEN_FIM_PREFIX}${prefixWithAdditionalContext}${QWEN_FIM_SUFFIX}${suffix}${QWEN_FIM_MIDDLE}`,
        stop: [QWEN_FIM_PREFIX, QWEN_FIM_SUFFIX, QWEN_FIM_MIDDLE],
      };
    }

    if (model.startsWith("deepseek")) {
      return {
        type: "prompt",
        prompt: `${DEEPSEEK_FIM_BEGIN}${prefixWithAdditionalContext}${DEEPSEEK_FIM_HOLE}${suffix}${DEEPSEEK_FIM_END}`,
        stop: [DEEPSEEK_FIM_BEGIN, DEEPSEEK_FIM_HOLE, DEEPSEEK_FIM_END, "<END>"],
      };
    }

    if (model.startsWith("stable-code")) {
      return {
        type: "prompt",
        prompt: `<fim_prefix>${prefixWithAdditionalContext}<fim_suffix>${suffix}<fim_middle>`,
        stop: ["<|endoftext|>"],
      };
    }

    // Default is CodeLLama style.
    return {
      type: "prompt",
      prompt: `<PRE> ${prefixWithAdditionalContext} <SUF>${suffix} <MID>`,
      stop: ["<PRE>", "<SUF>", "<MID>", "<END>", "EOT"],
    };
  }
}
