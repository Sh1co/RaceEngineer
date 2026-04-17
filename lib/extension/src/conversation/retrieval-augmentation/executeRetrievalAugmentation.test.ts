import { beforeEach, describe, expect, it, vi } from "vitest";
import { AIClient } from "../../ai/AIClient";
import {
  __resetVSCodeConfig,
  __setCommandHandler,
  __setVSCodeConfig,
  __setWorkspaceFolder,
} from "../../test/vscode.mock";
import { executeRetrievalAugmentation } from "./executeRetrievalAugmentation";
import * as readFileContentModule from "../../vscode/readFileContent";

describe("executeRetrievalAugmentation", () => {
  beforeEach(() => {
    __resetVSCodeConfig();
    __setVSCodeConfig("raceengineer", "provider", "Ollama");
    __setWorkspaceFolder("C:\\repo");
    vi.clearAllMocks();
  });

  it("reindexes once on metadata mismatch, reloads index, then continues", async () => {
    const readFileContentMock = vi
      .spyOn(readFileContentModule, "readFileContent")
      .mockImplementation(async () => "");
    readFileContentMock
      .mockResolvedValueOnce(
        JSON.stringify({
          version: 0,
          embedding: {
            source: "openai",
            model: "text-embedding-ada-002",
          },
          chunks: [
            {
              file: "a.ts",
              start_position: 1,
              end_position: 10,
              content: "return alpha",
              embedding: [1, 0, 0],
            },
          ],
        })
      )
      .mockResolvedValueOnce(
        JSON.stringify({
          version: 0,
          embedding: {
            source: "ollama",
            model: "nomic-embed-text",
          },
          chunks: [
            {
              file: "a.ts",
              start_position: 1,
              end_position: 10,
              content: "return alpha",
              embedding: [1, 0, 0],
            },
          ],
        })
      );

    const reindexHandler = vi.fn().mockResolvedValue(undefined);
    __setCommandHandler("raceengineer.indexRepository", reindexHandler);

    const ai = {
      getEmbeddingConfiguration() {
        return { source: "ollama", model: "nomic-embed-text" };
      },
      async generateEmbedding() {
        return {
          type: "success" as const,
          embedding: [1, 0, 0],
          totalTokenCount: 1,
        };
      },
    } as unknown as AIClient;

    const chunks = await executeRetrievalAugmentation({
      retrievalAugmentation: {
        type: "similarity-search",
        variableName: "context",
        source: "embedding-file",
        file: "raceengineer-repository.json",
        query: "alpha",
        threshold: 0,
        maxResults: 3,
      },
      initVariables: {},
      variables: {},
      ai,
    });

    expect(reindexHandler).toHaveBeenCalledTimes(1);
    expect(readFileContentMock).toHaveBeenCalledTimes(2);
    expect(chunks?.length).toBe(1);
    expect(chunks?.[0]?.content).toBe("return alpha");
  });

  it("reindexes when embedding index file is missing, then retries and continues", async () => {
    const fileNotFoundError = Object.assign(
      new Error("ENOENT: no such file or directory"),
      { code: "ENOENT" }
    );

    const readFileContentMock = vi
      .spyOn(readFileContentModule, "readFileContent")
      .mockImplementation(async () => "");
    readFileContentMock
      // first load: raceengineer-repository.json + repository.json both missing
      .mockRejectedValueOnce(fileNotFoundError)
      .mockRejectedValueOnce(fileNotFoundError)
      // second load after reindex: now index exists
      .mockResolvedValueOnce(
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

    const reindexHandler = vi.fn().mockResolvedValue(undefined);
    __setCommandHandler("raceengineer.indexRepository", reindexHandler);

    const ai = {
      getEmbeddingConfiguration() {
        return { source: "ollama", model: "nomic-embed-text" };
      },
      async generateEmbedding() {
        return {
          type: "success" as const,
          embedding: [1, 0, 0],
          totalTokenCount: 1,
        };
      },
    } as unknown as AIClient;

    const chunks = await executeRetrievalAugmentation({
      retrievalAugmentation: {
        type: "similarity-search",
        variableName: "context",
        source: "embedding-file",
        file: "raceengineer-repository.json",
        query: "obj['SUF']",
        threshold: 0,
        maxResults: 3,
      },
      initVariables: {},
      variables: {},
      ai,
    });

    expect(reindexHandler).toHaveBeenCalledTimes(1);
    expect(readFileContentMock).toHaveBeenCalledTimes(3);
    expect(chunks?.length).toBe(1);
    expect(chunks?.[0]?.file).toBe(
      "lib/extension/src/autocomplete/sanitizeAutoCompleteResponse.ts"
    );
  });

  it("falls back to lexical retrieval when threshold removes all semantic matches", async () => {
    vi.spyOn(readFileContentModule, "readFileContent").mockResolvedValue(
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
            content:
              "const KNOWN_PLACEHOLDER_SNIPPETS = [\"obj['SUF']\", \"obj['middle_code']\"]",
            embedding: [0, 1, 0],
          },
        ],
      })
    );

    const ai = {
      getEmbeddingConfiguration() {
        return { source: "ollama", model: "nomic-embed-text" };
      },
      async generateEmbedding() {
        return {
          type: "success" as const,
          embedding: [1, 0, 0],
          totalTokenCount: 1,
        };
      },
    } as unknown as AIClient;

    const chunks = await executeRetrievalAugmentation({
      retrievalAugmentation: {
        type: "similarity-search",
        variableName: "context",
        source: "embedding-file",
        file: "raceengineer-repository.json",
        query: "Find obj['middle_code'] sanitization logic",
        threshold: 0.99,
        maxResults: 3,
      },
      initVariables: {},
      variables: {},
      ai,
    });

    expect(chunks?.length).toBe(1);
    expect(chunks?.[0]?.file).toBe(
      "lib/extension/src/autocomplete/sanitizeAutoCompleteResponse.ts"
    );
    expect(chunks?.[0]?.content).toContain("middle_code");
  });

  it("throws explicit error when index remains incompatible after reindex", async () => {
    const readFileContentMock = vi
      .spyOn(readFileContentModule, "readFileContent")
      .mockImplementation(async () => "");
    readFileContentMock
      .mockResolvedValueOnce(
        JSON.stringify({
          version: 0,
          embedding: {
            source: "openai",
            model: "text-embedding-ada-002",
          },
          chunks: [],
        })
      )
      .mockResolvedValueOnce(
        JSON.stringify({
          version: 0,
          embedding: {
            source: "openai",
            model: "text-embedding-ada-002",
          },
          chunks: [],
        })
      );

    __setCommandHandler("raceengineer.indexRepository", vi.fn().mockResolvedValue(undefined));

    const ai = {
      getEmbeddingConfiguration() {
        return { source: "ollama", model: "nomic-embed-text" };
      },
      async generateEmbedding() {
        return {
          type: "success" as const,
          embedding: [1, 0, 0],
          totalTokenCount: 1,
        };
      },
    } as unknown as AIClient;

    await expect(
      executeRetrievalAugmentation({
        retrievalAugmentation: {
          type: "similarity-search",
          variableName: "context",
          source: "embedding-file",
          file: "repository.json",
          query: "alpha",
          threshold: 0,
          maxResults: 3,
        },
        initVariables: {},
        variables: {},
        ai,
      })
    ).rejects.toThrow("Embedding index metadata mismatch after reindex");
  });
});
