package com.raceengineer.jetbrains.service

import java.nio.file.Files
import java.nio.file.Path
import kotlin.io.path.isRegularFile
import kotlin.io.path.name

class WorkspaceContextResolver(
  private val maxDepth: Int = 8,
  private val ignoredSegments: Set<String> = setOf(
    ".git",
    ".idea",
    "node_modules",
    "dist",
    "build",
    "out",
    ".gradle",
    ".raceengineer",
  ),
) {
  fun findMentionedFiles(root: Path, userMessage: String, maxFiles: Int = 3): List<Path> {
    if (!Files.exists(root)) {
      return emptyList()
    }

    val fileNameCandidates = fileNameRegex.findAll(userMessage)
      .map { it.value.lowercase() }
      .toSet()
    val pathCandidates = pathRegex.findAll(userMessage)
      .map { normalizeCandidatePath(it.value) }
      .toSet()

    if (fileNameCandidates.isEmpty() && pathCandidates.isEmpty()) {
      return emptyList()
    }

    return Files.walk(root, maxDepth).use { stream ->
      stream
        .filter { path -> path.isRegularFile() }
        .filter { path ->
          val relative = normalizeCandidatePath(root.relativize(path).toString())
          !isIgnored(relative)
        }
        .filter { path ->
          val fileName = path.name.lowercase()
          if (fileNameCandidates.contains(fileName)) {
            return@filter true
          }
          val relative = normalizeCandidatePath(root.relativize(path).toString())
          pathCandidates.any { candidate ->
            relative == candidate || relative.endsWith("/$candidate")
          }
        }
        .limit(maxFiles.toLong())
        .toList()
    }
  }

  fun readSnippet(path: Path, maxChars: Int = 1500): String {
    return try {
      val text = Files.readString(path)
      if (text.length > maxChars) text.take(maxChars) else text
    } catch (_: Throwable) {
      "(unreadable file)"
    }
  }

  private fun normalizeCandidatePath(value: String): String {
    return value.replace('\\', '/').trim('/').lowercase()
  }

  private fun isIgnored(normalizedRelativePath: String): Boolean {
    val wrapped = "/$normalizedRelativePath/"
    return ignoredSegments.any { segment -> wrapped.contains("/$segment/") }
  }

  companion object {
    private val fileNameRegex = Regex("""\b[\w.\-]+\.(?:cs|kt|java|js|jsx|ts|tsx|py|json|md|xml|yaml|yml)\b""")
    private val pathRegex = Regex("""\b(?:[\w.\-]+[\\/])+[\w.\-]+\.(?:cs|kt|java|js|jsx|ts|tsx|py|json|md|xml|yaml|yml)\b""")
  }
}
