import {
  InstructionPrompt,
  TextStreamingModel,
  llamacpp,
  LlamaCppApiConfiguration,
  ollama,
  streamText,
  generateText,
} from "modelfusion";
import * as vscode from "vscode";
import { z } from "zod";
import { Logger } from "../logger";
import { ApiKeyManager } from "./ApiKeyManager";

type ProviderName = "llamafile" | "llama.cpp" | "Ollama" | "OpenAI";

type OllamaGenerateResponse = {
  response?: unknown;
  error?: unknown;
};

type OllamaChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type OllamaChatStreamChunk = {
  message?: {
    content?: unknown;
  };
  error?: unknown;
  done?: unknown;
};

type OllamaEmbedResponse = {
  embeddings?: unknown;
  error?: unknown;
  prompt_eval_count?: unknown;
};

type EmbeddingConfiguration = {
  source: string;
  model: string;
};

const KNOWN_PLACEHOLDER_RESPONSE_PATTERNS = [
  /^["'`]?obj\[\s*["'](?:middle_code|SUF|PRE|MID|prefix|suffix|fim_prefix|fim_suffix|fim_middle)["']\s*\]["'`]?;?$/i,
];

function isLikelyPythonFunctionContext(prefix: string): boolean {
  return /def\s+[A-Za-z_]\w*\s*\([^)]*\)\s*:\s*\n[ \t]*$/m.test(prefix);
}

function tryExtractFirstCodeBlock(text: string): string {
  const codeBlockMatch = text.match(/```[^\n]*\n([\s\S]*?)```/);
  return codeBlockMatch?.[1] ?? text;
}

function removeLeadingPrefixOverlap(text: string, prefix: string): string {
  if (prefix.length === 0 || text.length === 0) {
    return text;
  }

  const maxOverlap = Math.min(prefix.length, text.length);
  for (let overlap = maxOverlap; overlap > 0; overlap -= 1) {
    const prefixTail = prefix.slice(-overlap);
    if (text.startsWith(prefixTail)) {
      return text.slice(overlap);
    }
  }

  return text;
}

function isKnownPlaceholderLine(text: string): boolean {
  return KNOWN_PLACEHOLDER_RESPONSE_PATTERNS.some((pattern) =>
    pattern.test(text)
  );
}

function isLowValueInfillResponse(response: string, prefix: string): boolean {
  const codeLikeResponse = tryExtractFirstCodeBlock(response).trim();
  if (codeLikeResponse.length === 0) {
    return true;
  }

  const withoutPrefix = removeLeadingPrefixOverlap(codeLikeResponse, prefix);
  const trimmed = withoutPrefix.trim();
  if (trimmed.length === 0) {
    return true;
  }

  if (isKnownPlaceholderLine(trimmed)) {
    return true;
  }

  const nonEmptyLines = trimmed
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  return (
    nonEmptyLines.length > 0 &&
    nonEmptyLines.every((line) => isKnownPlaceholderLine(line))
  );
}

function getProviderBaseUrl(): string {
  let defaultUrl = "http://localhost:8080/";
  if (getProvider() === "Ollama") {
    defaultUrl = "http://localhost:11434";
  }
  return (
    vscode.workspace
      .getConfiguration("raceengineer")
      .get("providerBaseUrl", defaultUrl)
      // Ensure that the base URL doesn't have a trailing slash:
      .replace(/\/$/, "")
  );
}

function getChatModel(): string {
  let model = z
    .enum(["mistral:instruct", "codellama:instruct", "custom"])
    .parse(vscode.workspace.getConfiguration("raceengineer").get("model"));
  if (model === "custom") {
    return vscode.workspace.getConfiguration("raceengineer").get("customModel", "");
  }
  return model;
}
function getAutoCompleteModel(): string {
  return vscode.workspace
    .getConfiguration("raceengineer.autocomplete")
    .get("model", "");
}

function getEmbeddingModel(): string {
  return vscode.workspace
    .getConfiguration("raceengineer.embedding")
    .get("model", "nomic-embed-text");
}

function getProvider() {
  return z
    .enum(["llamafile", "llama.cpp", "Ollama", "OpenAI"])
    .parse(vscode.workspace.getConfiguration("raceengineer").get("provider")) as ProviderName;
}

function getChatEnableThinking(): boolean {
  return vscode.workspace
    .getConfiguration("raceengineer")
    .get("chat.enableThinking", false);
}

function isQwenChatModel(model: string): boolean {
  const normalizedModel = model.trim().toLowerCase();
  return (
    normalizedModel.startsWith("qwen3.5") || normalizedModel.startsWith("qwen3")
  );
}

function getPromptTemplate() {
  const model = getChatModel();
  if (model.startsWith("mistral")) {
    return ollama.prompt.Mistral;
  } else if (model.startsWith("deepseek")) {
    return ollama.prompt.Text;
  }

  return ollama.prompt.Llama2;
}

export class AIClient {
  private readonly apiKeyManager: ApiKeyManager;
  private readonly logger: Logger;

  constructor({
    apiKeyManager,
    logger,
  }: {
    apiKeyManager: ApiKeyManager;
    logger: Logger;
  }) {
    this.apiKeyManager = apiKeyManager;
    this.logger = logger;
  }

  public getModel(feature: string = "chat"): string {
    if (feature != "chat") {
      this.logger.log(["Autocomplete Model: ", getAutoCompleteModel()]);
      return getAutoCompleteModel();
    }
    return getChatModel();
  }

  public getProvider(): ProviderName {
    return getProvider();
  }

  public getEmbeddingConfiguration(): EmbeddingConfiguration {
    return {
      source: "ollama",
      model: getEmbeddingModel(),
    };
  }

  public shouldUseNativeOllamaQwenChat(): boolean {
    return this.getProvider() === "Ollama" && isQwenChatModel(this.getModel());
  }

  private async getProviderApiConfiguration() {
    if (getProvider().startsWith("llama")) {
      return new LlamaCppApiConfiguration({ baseUrl: getProviderBaseUrl() });
    }

    return ollama.Api({ baseUrl: getProviderBaseUrl() });
  }

  async getTextStreamingModel({
    maxTokens,
    stop,
    temperature = 0,
  }: {
    maxTokens: number;
    stop?: string[] | undefined;
    temperature?: number | undefined;
  }): Promise<TextStreamingModel<InstructionPrompt>> {
    const provider = getProvider();

    if (provider.startsWith("llama")) {
      return llamacpp
        .CompletionTextGenerator({
          api: await this.getProviderApiConfiguration(),
          // TODO the prompt format needs to be configurable for non-Llama2 models
          promptTemplate: llamacpp.prompt.Llama2,
          maxGenerationTokens: maxTokens,
          stopSequences: stop,
          temperature,
        })
        .withInstructionPrompt();
    }

    return ollama
      .CompletionTextGenerator({
        api: await this.getProviderApiConfiguration(),
        promptTemplate: getPromptTemplate(),
        model: this.getModel(),
        maxGenerationTokens: maxTokens,
        stopSequences: stop,
        temperature,
      })
      .withInstructionPrompt();
  }

  async getTextGenerationModel({
    maxTokens,
    stop,
    temperature = 0,
  }: {
    maxTokens: number;
    stop?: string[] | undefined;
    temperature?: number | undefined;
  }) {
    if (getProvider().startsWith("llama")) {
      return llamacpp
        .CompletionTextGenerator({
          api: await this.getProviderApiConfiguration(),
          maxGenerationTokens: maxTokens,
          stopSequences: stop,
          temperature,
        })
        .withTextPrompt();
    }
    return ollama
      .CompletionTextGenerator({
        api: await this.getProviderApiConfiguration(),
        model: this.getModel("autocomplete"),
        temperature: temperature,
        maxGenerationTokens: maxTokens,
        stopSequences: stop,
      })
      .withTextPrompt(); // use text prompt style
  }

  async streamText({
    prompt,
    maxTokens,
    stop,
    temperature = 0,
  }: {
    prompt: string;
    maxTokens: number;
    stop?: string[] | undefined;
    temperature?: number | undefined;
  }) {
    this.logger.log(["--- Start prompt ---", prompt, "--- End prompt ---"]);

    if (this.shouldUseNativeOllamaQwenChat()) {
      const response = await fetch(`${getProviderBaseUrl()}/api/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.getModel(),
          messages: [
            {
              role: "system",
              content: "You are a Bot who is here to assist Developer.",
            } satisfies OllamaChatMessage,
            { role: "user", content: prompt } satisfies OllamaChatMessage,
          ],
          think: getChatEnableThinking(),
          stream: true,
          options: {
            temperature,
            num_predict: maxTokens,
            ...(stop == null ? {} : { stop }),
          },
        }),
      });

      if (!response.ok) {
        throw new Error(
          `Chat request failed with status ${response.status} for model ${this.getModel()}.`
        );
      }

      if (response.body == null) {
        throw new Error("Chat response stream body was empty.");
      }

      return this.streamOllamaChatContent(response.body);
    }

    return streamText({
      model: await this.getTextStreamingModel({ maxTokens, stop, temperature }),
      prompt: {
        system: "You are a Bot who is here to assist Developer.",
        instruction: prompt,
      },
    });
  }
  async generateText({
    prompt,
    maxTokens = 2048,
    stop,
    temperature = 0,
  }: {
    prompt: string;
    maxTokens?: number;
    stop?: string[] | undefined;
    temperature?: number | undefined;
  }): Promise<string> {
    this.logger.log(["--- Start prompt ---", prompt, "--- End prompt ---"]);
    return generateText({
      model: await this.getTextGenerationModel({
        maxTokens,
        stop,
        temperature,
      }),
      prompt: prompt,
    });
  }

  async generateInfillText({
    prefix,
    suffix,
    maxTokens = 256,
    stop,
    temperature = 0,
  }: {
    prefix: string;
    suffix: string;
    maxTokens?: number;
    stop?: string[] | undefined;
    temperature?: number | undefined;
  }): Promise<string> {
    if (this.getProvider() !== "Ollama") {
      throw new Error(
        "Infill autocomplete is only supported when raceengineer.provider is set to Ollama."
      );
    }

    // Qwen/Ollama infill templates switch mode based on whether suffix is set.
    // Ensure non-empty suffix so infill mode is used even at end-of-file cursor.
    const suffixCandidates: string[] = [
      suffix.length > 0 ? suffix : "\n",
    ];
    if (suffix.length === 0 && isLikelyPythonFunctionContext(prefix)) {
      // Some Python EOF contexts return empty text with plain newline suffix.
      // Retry with a minimal hint boundary.
      suffixCandidates.push("\nreturn");
    }

    this.logger.log([
      "--- Start infill prompt ---",
      prefix,
      "--- End infill prompt ---",
    ]);

    let lastResponseText = "";
    for (const candidateSuffix of suffixCandidates) {
      const response = await fetch(`${getProviderBaseUrl()}/api/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.getModel("autocomplete"),
          prompt: prefix,
          suffix: candidateSuffix,
          stream: false,
          options: {
            temperature,
            num_predict: maxTokens,
            ...(stop == null ? {} : { stop }),
          },
        }),
      });

      if (!response.ok) {
        throw new Error(
          `Infill autocomplete request failed with status ${response.status}`
        );
      }

      const data = (await response.json()) as OllamaGenerateResponse;
      if (typeof data.error === "string" && data.error.length > 0) {
        throw new Error(data.error);
      }

      if (typeof data.response !== "string") {
        throw new Error("Infill autocomplete response did not contain text.");
      }

      lastResponseText = data.response;
      if (!isLowValueInfillResponse(lastResponseText, prefix)) {
        return lastResponseText;
      }
    }

    return lastResponseText;
  }

  async generateEmbedding({ input }: { input: string }) {
    if (this.getProvider() !== "Ollama") {
      throw new Error(
        "Embedding generation requires raceengineer.provider to be set to Ollama."
      );
    }

    try {
      const response = await fetch(`${getProviderBaseUrl()}/api/embed`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: getEmbeddingModel(),
          input,
        }),
      });

      if (!response.ok) {
        throw new Error(
          `Embedding request failed with status ${response.status} for model ${getEmbeddingModel()}.`
        );
      }

      const data = (await response.json()) as OllamaEmbedResponse;

      if (typeof data.error === "string" && data.error.length > 0) {
        throw new Error(data.error);
      }

      if (!Array.isArray(data.embeddings) || data.embeddings.length === 0) {
        throw new Error("Embedding response did not contain vectors.");
      }

      const firstEmbedding = data.embeddings[0];
      if (
        !Array.isArray(firstEmbedding) ||
        !firstEmbedding.every((value) => typeof value === "number")
      ) {
        throw new Error("Embedding response vector format was invalid.");
      }

      return {
        type: "success" as const,
        embedding: firstEmbedding,
        totalTokenCount:
          typeof data.prompt_eval_count === "number"
            ? data.prompt_eval_count
            : undefined,
      };
    } catch (error: any) {
      console.log(error);

      return {
        type: "error" as const,
        errorMessage: error?.message,
      };
    }
  }

  private async *streamOllamaChatContent(
    body: ReadableStream<Uint8Array>
  ): AsyncGenerator<string> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffered = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }

      buffered += decoder.decode(value, { stream: true });
      let newlineIndex = buffered.indexOf("\n");
      while (newlineIndex >= 0) {
        const line = buffered.slice(0, newlineIndex).trim();
        buffered = buffered.slice(newlineIndex + 1);

        if (line.length > 0) {
          const content = this.parseOllamaChatStreamLine(line);
          if (content.length > 0) {
            yield content;
          }
        }

        newlineIndex = buffered.indexOf("\n");
      }
    }

    buffered += decoder.decode();
    const tail = buffered.trim();
    if (tail.length > 0) {
      const content = this.parseOllamaChatStreamLine(tail);
      if (content.length > 0) {
        yield content;
      }
    }
  }

  private parseOllamaChatStreamLine(line: string): string {
    let parsed: OllamaChatStreamChunk;
    try {
      parsed = JSON.parse(line) as OllamaChatStreamChunk;
    } catch (error) {
      throw new Error(`Failed to parse chat stream line: ${line}`);
    }

    if (typeof parsed.error === "string" && parsed.error.length > 0) {
      throw new Error(parsed.error);
    }

    return typeof parsed.message?.content === "string"
      ? parsed.message.content
      : "";
  }
}
