import Handlebars from "handlebars";
import secureJSON from "secure-json-parse";
import * as vscode from "vscode";
import { AIClient } from "../../ai/AIClient";
import { readFileContent } from "../../vscode/readFileContent";
import { RetrievalAugmentation } from "../template/RubberduckTemplate";
import { cosineSimilarity } from "./cosineSimilarity";
import { EmbeddingFile, embeddingFileSchema } from "./EmbeddingFile";

export async function executeRetrievalAugmentation({
  retrievalAugmentation,
  initVariables,
  variables,
  ai,
}: {
  retrievalAugmentation: RetrievalAugmentation;
  initVariables: Record<string, unknown>;
  variables: Record<string, unknown>;
  ai: AIClient;
}): Promise<
  | Array<{
      file: string;
      startPosition: number;
      endPosition: number;
      content: string;
    }>
  | undefined
> {
  const embeddingConfig = ai.getEmbeddingConfiguration();
  let embeddingFile = await loadEmbeddingFile(retrievalAugmentation.file);

  if (!isEmbeddingConfigCompatible(embeddingFile.embedding, embeddingConfig)) {
    await vscode.commands.executeCommand("raceengineer.indexRepository");
    embeddingFile = await loadEmbeddingFile(retrievalAugmentation.file);

    if (!isEmbeddingConfigCompatible(embeddingFile.embedding, embeddingConfig)) {
      throw new Error(
        `Embedding index metadata mismatch after reindex. Expected ${embeddingConfig.source}/${embeddingConfig.model}, got ${embeddingFile.embedding.source}/${embeddingFile.embedding.model}.`
      );
    }
  }

  const { chunks } = embeddingFile;

  // expand query with variables:
  const query = Handlebars.compile(retrievalAugmentation.query, {
    noEscape: true,
  })({
    ...initVariables,
    ...variables,
  });

  const result = await ai.generateEmbedding({
    input: query,
  });

  if (result.type === "error") {
    throw new Error(
      result.errorMessage ?? "Failed to generate embedding for retrieval query."
    );
  }

  const queryEmbedding = result.embedding!;

  const similarityChunks = chunks
    .map(({ start_position, end_position, content, file, embedding }) => ({
      file,
      startPosition: start_position,
      endPosition: end_position,
      content,
      similarity: cosineSimilarity(embedding, queryEmbedding),
    }))
    .filter(({ similarity }) => similarity >= retrievalAugmentation.threshold);

  similarityChunks.sort((a, b) => b.similarity - a.similarity);

  return similarityChunks
    .slice(0, retrievalAugmentation.maxResults)
    .map((chunk) => ({
      file: chunk.file,
      startPosition: chunk.startPosition,
      endPosition: chunk.endPosition,
      content: chunk.content,
    }));
}

function getFileCandidates(file: string): string[] {
  if (file === "repository.json" || file === "raceengineer-repository.json") {
    return ["raceengineer-repository.json", "repository.json"];
  }
  return [file];
}

async function loadEmbeddingFile(file: string): Promise<EmbeddingFile> {
  const workspaceRoot =
    vscode.workspace.workspaceFolders?.[0]?.uri ?? vscode.Uri.file("");
  const candidates = getFileCandidates(file);

  let lastError: unknown;
  for (const candidate of candidates) {
    const fileUri = vscode.Uri.joinPath(
      workspaceRoot,
      ".raceengineer/embedding",
      candidate
    );

    try {
      const fileContent = await readFileContent(fileUri);
      const parsedContent = secureJSON.parse(fileContent);
      return embeddingFileSchema.parse(parsedContent);
    } catch (error) {
      if (isFileNotFoundError(error)) {
        lastError = error;
        continue;
      }

      throw error;
    }
  }

  throw new Error(
    `Embedding index file not found for '${file}' in .raceengineer/embedding. Last error: ${
      (lastError as Error | undefined)?.message ?? "unknown"
    }`
  );
}

function isFileNotFoundError(error: unknown): boolean {
  if (error == null || typeof error !== "object") {
    return false;
  }

  const code = (error as { code?: unknown }).code;
  if (code === "ENOENT" || code === "FileNotFound") {
    return true;
  }

  const message = (error as { message?: unknown }).message;
  return typeof message === "string" && /FileNotFound|ENOENT/i.test(message);
}

function isEmbeddingConfigCompatible(
  metadata: { source: string; model: string },
  current: { source: string; model: string }
): boolean {
  return (
    metadata.source.toLowerCase() === current.source.toLowerCase() &&
    metadata.model.toLowerCase() === current.model.toLowerCase()
  );
}
