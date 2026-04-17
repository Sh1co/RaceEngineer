package com.raceengineer.jetbrains.completion

object AutoCompleteContextNormalizer {
  fun normalize(prefix: String, suffix: String): Pair<String, String> {
    val prefixLines = prefix.split("\n").toMutableList()
    if (prefixLines.isNotEmpty()) {
      val lastLineIndex = prefixLines.lastIndex
      val lastLine = prefixLines[lastLineIndex]
      val match = Regex("""^([ \t]*)(?:#|//)\s*cursor here\b.*$""", RegexOption.IGNORE_CASE).matchEntire(lastLine)
      if (match != null) {
        prefixLines[lastLineIndex] = match.groupValues[1]
      }
    }
    val normalizedPrefix = prefixLines.joinToString("\n")

    val normalizedSuffix = suffix.replace(
      Regex("""^[ \t]*(?:#|//)\s*cursor here\b[^\n]*\r?\n?""", RegexOption.IGNORE_CASE),
      "",
    )
    return normalizedPrefix to normalizedSuffix
  }
}

object AutoCompleteSanitizer {
  private val controlTokens = listOf(
    "<｜fim▁begin｜>",
    "<｜fim▁hole｜>",
    "<｜fim▁end｜>",
    "<|fim_prefix|>",
    "<|fim_suffix|>",
    "<|fim_middle|>",
    "<fim_prefix>",
    "<fim_suffix>",
    "<fim_middle>",
    "<PRE>",
    "<SUF>",
    "<MID>",
    "<END>",
    "EOT",
    "<|endoftext|>",
  )

  private val placeholderRegex = Regex("""^["'`]?obj\[\s*["'](?:middle_code|SUF|PRE|MID|prefix|suffix|fim_prefix|fim_suffix|fim_middle)["']\s*]["'`]?;?$""", RegexOption.IGNORE_CASE)

  fun sanitize(raw: String, prefix: String = "", suffix: String = ""): String {
    var result = raw
    controlTokens.forEach { token ->
      result = result.replace(token, "")
    }
    result = extractFirstCodeBlock(result)
    result = stripKnownContextPrefix(result)
    result = removeLeadingPrefixOverlap(result, prefix)
    result = removeTrailingSuffixOverlap(result, suffix)
    result = truncateTail(result, prefix)
    result = result.trim()
    if (placeholderRegex.matches(result)) {
      return ""
    }
    return result
  }

  private fun extractFirstCodeBlock(text: String): String {
    val match = Regex("```[^\\n]*\\n([\\s\\S]*?)```").find(text)
    return match?.groupValues?.getOrNull(1) ?: text
  }

  private fun stripKnownContextPrefix(text: String): String {
    return text.replace(Regex("""^(?:[ \t]*(?:#|//)\s*(?:Language|File uri):.*\r?\n)+""", RegexOption.IGNORE_CASE), "")
  }

  private fun removeLeadingPrefixOverlap(text: String, prefix: String): String {
    if (prefix.isEmpty() || text.isEmpty()) return text
    val maxOverlap = minOf(prefix.length, text.length)
    for (overlap in maxOverlap downTo 1) {
      if (text.startsWith(prefix.takeLast(overlap))) {
        return text.substring(overlap)
      }
    }
    return text
  }

  private fun removeTrailingSuffixOverlap(text: String, suffix: String): String {
    if (suffix.isEmpty() || text.isEmpty()) return text
    val fullSuffixIndex = text.indexOf(suffix)
    val withoutFullSuffix = if (fullSuffixIndex >= 0) text.substring(0, fullSuffixIndex) else text
    val maxOverlap = minOf(withoutFullSuffix.length, suffix.length)
    for (overlap in maxOverlap downTo 1) {
      if (withoutFullSuffix.endsWith(suffix.take(overlap))) {
        return withoutFullSuffix.dropLast(overlap)
      }
    }
    return withoutFullSuffix
  }

  private fun truncateTail(text: String, prefix: String): String {
    val indentedInsertion = Regex("""(?:^|\n)([ \t]*)$""").find(prefix)?.groupValues?.getOrNull(1)?.isNotEmpty() == true
    if (indentedInsertion) {
      val idx = text.indexOf("\n\n")
      if (idx >= 0 && text.getOrNull(idx + 2)?.isWhitespace() == false) {
        return text.substring(0, idx)
      }
    }
    val marker = Regex("""\n\n(?=\s*(?:#|//|def\s|class\s|function\s|if __name__|In the |(?:public|private|protected|internal)\s+))""", RegexOption.IGNORE_CASE).find(text)
    return if (marker != null) text.substring(0, marker.range.first) else text
  }
}
