import { describe, expect, it } from "vitest";
import { embeddingFileSchema } from "./EmbeddingFile";

describe("embeddingFileSchema", () => {
  it("parses legacy openai embedding metadata", () => {
    const parsed = embeddingFileSchema.parse({
      version: 0,
      embedding: {
        source: "openai",
        model: "text-embedding-ada-002",
      },
      chunks: [],
    });

    expect(parsed.embedding.source).toBe("openai");
    expect(parsed.embedding.model).toBe("text-embedding-ada-002");
  });

  it("parses native ollama embedding metadata", () => {
    const parsed = embeddingFileSchema.parse({
      version: 0,
      embedding: {
        source: "ollama",
        model: "nomic-embed-text",
      },
      chunks: [],
    });

    expect(parsed.embedding.source).toBe("ollama");
    expect(parsed.embedding.model).toBe("nomic-embed-text");
  });
});
