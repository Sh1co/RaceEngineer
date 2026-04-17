package com.raceengineer.jetbrains.completion

import com.intellij.codeInsight.completion.*
import com.intellij.codeInsight.lookup.LookupElementBuilder
import com.intellij.openapi.diagnostic.Logger
import com.intellij.patterns.PlatformPatterns
import com.intellij.util.ProcessingContext
import com.raceengineer.jetbrains.ollama.OllamaClient
import com.raceengineer.jetbrains.settings.RaceEngineerSettingsState
import java.util.concurrent.ConcurrentHashMap

class RaceEngineerCompletionContributor : CompletionContributor() {
  private val logger = Logger.getInstance(RaceEngineerCompletionContributor::class.java)

  companion object {
    private val lastRequestAtByEditor = ConcurrentHashMap<String, Long>()
  }

  init {
    extend(
      CompletionType.BASIC,
      PlatformPatterns.psiElement(),
      object : CompletionProvider<CompletionParameters>() {
        override fun addCompletions(
          parameters: CompletionParameters,
          context: ProcessingContext,
          result: CompletionResultSet
        ) {
          val settings = RaceEngineerSettingsState.getInstance()
          if (settings.autocompleteMode == "disabled") {
            return
          }
          if (settings.provider != "Ollama") {
            return
          }
          if (settings.autocompleteMode == "manual" && parameters.invocationCount == 0) {
            return
          }
          if (!shouldRunNow(parameters.editor, settings.autocompleteDebounceWait)) {
            return
          }

          val editor = parameters.editor
          val document = editor.document
          val offset = parameters.offset
          if (offset <= 0 || offset > document.textLength) {
            return
          }

          val context = getSurroundingCodeContext(document, offset, 300)
          val prefix = context.first
          val suffix = context.second
          val normalized = AutoCompleteContextNormalizer.normalize(prefix, suffix)
          val additionalContext = buildAdditionalContext(
            parameters.position.language.displayName,
            parameters.originalFile.virtualFile?.path
          )

          try {
            val strategy = AutoCompleteTemplateProvider.getStrategy(
              model = settings.autocompleteModel,
              provider = settings.provider,
              additionalContext = additionalContext,
              prefix = normalized.first,
              suffix = normalized.second,
            )

            val ollama = OllamaClient(settings)
            val raw = when (strategy) {
              is AutoCompleteStrategy.Infill -> ollama.infill(
                prefix = strategy.prefix,
                suffix = strategy.suffix,
                maxTokens = strategy.maxTokens,
              )

              is AutoCompleteStrategy.Prompt -> ollama.promptComplete(
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

            if (completion.isBlank()) {
              return
            }

            result.addElement(
              LookupElementBuilder.create(completion)
                .withPresentableText(completion.lines().firstOrNull() ?: completion)
                .withTypeText("RaceEngineer")
            )
          } catch (error: Throwable) {
            logger.warn("RaceEngineer autocomplete failed: ${error.message}", error)
          }
        }
      }
    )
  }

  private fun buildAdditionalContext(language: String, filePath: String?): String {
    val languageLine = "// Language: $language"
    val fileLine = if (filePath.isNullOrBlank()) "" else "// File uri: $filePath"
    return listOf(languageLine, fileLine).filter { it.isNotBlank() }.joinToString("\n")
  }

  private fun shouldRunNow(editor: com.intellij.openapi.editor.Editor, debounceMs: Int): Boolean {
    val key = "${editor.document.hashCode()}:${editor.caretModel.offset}"
    val now = System.currentTimeMillis()
    val previous = lastRequestAtByEditor.put(key, now)
    if (previous == null) {
      return true
    }
    return now - previous >= debounceMs
  }

  private fun getSurroundingCodeContext(
    document: com.intellij.openapi.editor.Document,
    offset: Int,
    numLinesAsContext: Int,
  ): Pair<String, String> {
    val line = document.getLineNumber(offset)
    val startLine = maxOf(0, line - numLinesAsContext)
    val endLine = minOf(document.lineCount - 1, line + numLinesAsContext)

    val prefixStart = document.getLineStartOffset(startLine)
    val suffixEndExclusive = if (endLine + 1 < document.lineCount) {
      document.getLineStartOffset(endLine + 1)
    } else {
      document.textLength
    }

    val prefix = document.charsSequence.subSequence(prefixStart, offset).toString()
    val suffix = document.charsSequence.subSequence(offset, suffixEndExclusive).toString()
    return prefix to suffix
  }
}
