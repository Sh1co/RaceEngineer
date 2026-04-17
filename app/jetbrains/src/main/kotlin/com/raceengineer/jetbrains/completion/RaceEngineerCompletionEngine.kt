package com.raceengineer.jetbrains.completion

import com.raceengineer.jetbrains.settings.RaceEngineerSettingsState
import java.util.concurrent.ConcurrentHashMap

data class CompletionEngineInput(
  val settings: RaceEngineerSettingsState,
  val invocationCount: Int,
  val editorKey: String,
  val language: String,
  val filePath: String?,
  val prefix: String,
  val suffix: String,
)

interface CompletionTextGenerator {
  fun infill(prefix: String, suffix: String, maxTokens: Int): String
  fun promptComplete(prompt: String, stop: List<String>, maxTokens: Int): String
}

class RaceEngineerCompletionEngine(
  private val nowProvider: () -> Long = { System.currentTimeMillis() },
) {
  private val lastRequestAtByEditor = ConcurrentHashMap<String, Long>()

  fun complete(
    input: CompletionEngineInput,
    generator: CompletionTextGenerator,
  ): String? {
    if (!shouldRun(input)) {
      return null
    }

    val normalized = AutoCompleteContextNormalizer.normalize(input.prefix, input.suffix)
    val additionalContext = buildAdditionalContext(input.language, input.filePath)
    val strategy = AutoCompleteTemplateProvider.getStrategy(
      model = input.settings.autocompleteModel,
      provider = input.settings.provider,
      additionalContext = additionalContext,
      prefix = normalized.first,
      suffix = normalized.second,
    )

    val raw = when (strategy) {
      is AutoCompleteStrategy.Infill -> generator.infill(
        prefix = strategy.prefix,
        suffix = strategy.suffix,
        maxTokens = strategy.maxTokens,
      )

      is AutoCompleteStrategy.Prompt -> generator.promptComplete(
        prompt = strategy.prompt,
        stop = strategy.stop,
        maxTokens = strategy.maxTokens,
      )
    }

    val completion = AutoCompleteSanitizer.sanitize(
      raw = raw,
      prefix = if (strategy is AutoCompleteStrategy.Infill) strategy.prefix else normalized.first,
      suffix = if (strategy is AutoCompleteStrategy.Infill) strategy.suffix else normalized.second,
    )

    return completion.ifBlank { null }
  }

  private fun shouldRun(input: CompletionEngineInput): Boolean {
    val settings = input.settings
    if (settings.autocompleteMode == "disabled") {
      return false
    }
    if (settings.provider != "Ollama") {
      return false
    }
    if (settings.autocompleteMode == "manual" && input.invocationCount == 0) {
      return false
    }

    val now = nowProvider()
    val previous = lastRequestAtByEditor.put(input.editorKey, now)
    if (previous == null) {
      return true
    }

    return now - previous >= settings.autocompleteDebounceWait
  }

  private fun buildAdditionalContext(language: String, filePath: String?): String {
    val languageLine = "// Language: $language"
    val fileLine = if (filePath.isNullOrBlank()) "" else "// File uri: $filePath"
    return listOf(languageLine, fileLine).filter { it.isNotBlank() }.joinToString("\n")
  }
}
