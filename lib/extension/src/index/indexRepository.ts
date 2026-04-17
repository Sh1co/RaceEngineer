import fs from "node:fs/promises";
import path from "node:path";
import { simpleGit } from "simple-git";
import * as vscode from "vscode";
import { AIClient } from "../ai/AIClient";
import { ChunkWithContent } from "../conversation/retrieval-augmentation/EmbeddingFile";
import { createSplitLinearLines } from "./chunk/splitLinearLines";

const MAX_FILE_BYTES = 200_000;
const SUPPORTED_EXTENSIONS = new Set([
  ".js",
  ".ts",
  ".tsx",
  ".sh",
  ".yaml",
  ".yml",
  ".md",
  ".css",
  ".json",
  ".toml",
  ".config",
]);

const IGNORED_PATH_SEGMENTS = new Set([
  ".git",
  ".hg",
  ".svn",
  ".raceengineer",
  "node_modules",
  "vendor",
  ".venv",
  "venv",
  "env",
  "__pycache__",
  ".pytest_cache",
  ".mypy_cache",
  ".ruff_cache",
  ".tox",
  "dist",
  "build",
  "out",
  "coverage",
  ".next",
  ".nuxt",
  ".svelte-kit",
  ".turbo",
  ".cache",
]);

export async function indexRepository({
  ai,
  outputChannel,
}: {
  ai: AIClient;
  outputChannel: vscode.OutputChannel;
}) {
  const repositoryPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

  if (repositoryPath == undefined) {
    vscode.window.showErrorMessage("RaceEngineer: No workspace folder is open.");
    return;
  }

  outputChannel.show(true);
  outputChannel.appendLine(`Indexing repository ${repositoryPath}`);

  const git = simpleGit({
    baseDir: repositoryPath,
    binary: "git",
    maxConcurrentProcesses: 6,
    trimmed: false,
  });

  const files = await getRepositoryFiles({
    repositoryPath,
    git,
    outputChannel,
  });
  const chunksWithEmbedding: Array<ChunkWithContent> = [];

  let tokenCount = 0;
  let cancelled = false;

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "Indexing repository",
      cancellable: true,
    },
    async (progress, cancellationToken) => {
      const progressUnit = files.length === 0 ? 100 : 100 / files.length;

      for (const file of files) {
        progress.report({
          message: `Indexing ${file}`,
          increment: progressUnit,
        });

        if (cancellationToken.isCancellationRequested) {
          cancelled = true;
          break;
        }

        const absoluteFilePath = path.join(repositoryPath, file);

        let stat;
        try {
          stat = await fs.stat(absoluteFilePath);
        } catch (error) {
          outputChannel.appendLine(`Skipping unreadable file '${file}'`);
          console.error(error);
          continue;
        }

        if (!stat.isFile()) {
          continue;
        }

        if (stat.size > MAX_FILE_BYTES) {
          outputChannel.appendLine(
            `Skipping large file '${file}' (${stat.size} bytes)`
          );
          continue;
        }

        let content = "";
        try {
          content = await fs.readFile(absoluteFilePath, "utf8");
        } catch (error) {
          outputChannel.appendLine(`Skipping non-text file '${file}'`);
          console.error(error);
          continue;
        }

        const chunks = createSplitLinearLines({
          maxChunkCharacters: 500, // ~4 char per token
        })(content);

        for (const chunk of chunks) {
          if (cancellationToken.isCancellationRequested) {
            cancelled = true;
            break;
          }

          outputChannel.appendLine(
            `Generating embedding for chunk '${file}' ${chunk.startPosition}:${chunk.endPosition}`
          );

          try {
            const embeddingResult = await ai.generateEmbedding({
              input: chunk.content,
            });

            if (embeddingResult.type === "error") {
              outputChannel.appendLine(
                `Failed to generate embedding for chunk '${file}' ${chunk.startPosition}:${chunk.endPosition} - ${embeddingResult.errorMessage}}`
              );

              console.error(embeddingResult.errorMessage);
              continue;
            }

            chunksWithEmbedding.push({
              file,
              start_position: chunk.startPosition,
              end_position: chunk.endPosition,
              content: chunk.content,
              embedding: embeddingResult.embedding,
            });

            tokenCount += embeddingResult?.totalTokenCount ?? 0;
          } catch (error) {
            console.error(error);

            outputChannel.appendLine(
              `Failed to generate embedding for chunk '${file}' ${chunk.startPosition}:${chunk.endPosition}`
            );
          }
        }
      }
    }
  );

  if (!cancelled) {
    const embeddingDir = path.join(repositoryPath, ".raceengineer", "embedding");
    const primaryFilename = path.join(embeddingDir, "raceengineer-repository.json");
    const legacyFilename = path.join(embeddingDir, "repository.json");
    const embeddingConfiguration = ai.getEmbeddingConfiguration();

    await fs.mkdir(embeddingDir, {
      recursive: true,
    });

    const serializedContent = JSON.stringify({
      version: 0,
      embedding: {
        source: embeddingConfiguration.source,
        model: embeddingConfiguration.model,
      },
      chunks: chunksWithEmbedding,
    });

    await fs.writeFile(
      primaryFilename,
      serializedContent
    );

    await fs.writeFile(
      legacyFilename,
      serializedContent
    );
  }

  outputChannel.appendLine("");

  if (cancelled) {
    outputChannel.appendLine("Indexing cancelled");
  }

  outputChannel.appendLine(`Tokens used: ${tokenCount}`);
  outputChannel.appendLine(`Cost: ${(tokenCount / 1000) * 0.0004} USD`);
}

async function getRepositoryFiles({
  repositoryPath,
  git,
  outputChannel,
}: {
  repositoryPath: string;
  git: ReturnType<typeof simpleGit>;
  outputChannel: vscode.OutputChannel;
}) {
  try {
    const rawFiles = await git.raw([
      "ls-files",
      "--cached",
      "--others",
      "--exclude-standard",
    ]);

    return sanitizeRepositoryFiles(rawFiles.split("\n"));
  } catch (error) {
    outputChannel.appendLine(
      "Git file listing failed. Falling back to filesystem scan."
    );
    console.error(error);

    const allFiles = await listFilesFromFilesystem(repositoryPath);
    return sanitizeRepositoryFiles(allFiles);
  }
}

async function listFilesFromFilesystem(rootDirectory: string) {
  const queue = [rootDirectory];
  const files: string[] = [];

  while (queue.length > 0) {
    const currentDirectory = queue.shift()!;
    const entries = await fs.readdir(currentDirectory, {
      withFileTypes: true,
    });

    for (const entry of entries) {
      const absolutePath = path.join(currentDirectory, entry.name);
      const relativePath = normalizeRelativePath(
        path.relative(rootDirectory, absolutePath)
      );

      if (entry.isDirectory()) {
        if (isIgnoredPath(relativePath)) {
          continue;
        }

        queue.push(absolutePath);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      files.push(relativePath);
    }
  }

  return files;
}

function sanitizeRepositoryFiles(files: string[]) {
  const uniqueFiles = new Set<string>();

  for (const file of files) {
    const normalized = normalizeRelativePath(file);
    if (normalized.length === 0) {
      continue;
    }

    if (!isSupportedFile(normalized)) {
      continue;
    }

    uniqueFiles.add(normalized);
  }

  return Array.from(uniqueFiles).sort();
}

function normalizeRelativePath(file: string) {
  return file
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\.\/+/, "");
}

export function isSupportedFile(file: string) {
  if (isIgnoredPath(file)) {
    return false;
  }

  const extension = path.extname(file).toLowerCase();
  if (!SUPPORTED_EXTENSIONS.has(extension)) {
    return false;
  }

  const lowerFile = file.toLowerCase();
  if (
    lowerFile.endsWith(".min.js") ||
    lowerFile.endsWith(".min.css") ||
    lowerFile.endsWith("pnpm-lock.yaml")
  ) {
    return false;
  }

  return true;
}

export function isIgnoredPath(file: string) {
  const normalized = normalizeRelativePath(file).toLowerCase();
  if (normalized.length === 0) {
    return true;
  }

  const segments: string[] = normalized.split("/");
  if (segments.some((segment) => IGNORED_PATH_SEGMENTS.has(segment))) {
    return true;
  }

  return false;
}
