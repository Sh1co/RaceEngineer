package com.raceengineer.jetbrains.completion

import com.intellij.codeInsight.completion.*
import com.intellij.codeInsight.lookup.LookupElementBuilder
import com.intellij.openapi.diagnostic.Logger
import com.intellij.patterns.PlatformPatterns
import com.intellij.util.ProcessingContext
import com.raceengineer.jetbrains.ollama.OllamaClient
import com.raceengineer.jetbrains.settings.RaceEngineerSettingsState

class RaceEngineerCompletionContributor : CompletionContributor() {
  private val logger = Logger.getInstance(RaceEngineerCompletionContributor::class.java)
  private val engine = RaceEngineerCompletionEngine()

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

          val editor = parameters.editor
          val document = editor.document
          val offset = parameters.offset
          if (offset <= 0 || offset > document.textLength) {
            return
          }

          val contextWindow = getSurroundingCodeContext(document, offset, 300)

          try {
            val ollama = OllamaClient(settings)
            val completion = engine.complete(
              input = CompletionEngineInput(
                settings = settings,
                invocationCount = parameters.invocationCount,
                editorKey = editor.document.hashCode().toString(),
                language = parameters.position.language.displayName,
                filePath = parameters.originalFile.virtualFile?.path,
                prefix = contextWindow.first,
                suffix = contextWindow.second,
              ),
              generator = object : CompletionTextGenerator {
                override fun infill(prefix: String, suffix: String, maxTokens: Int): String {
                  return ollama.infill(prefix, suffix, maxTokens)
                }

                override fun promptComplete(prompt: String, stop: List<String>, maxTokens: Int): String {
                  return ollama.promptComplete(prompt, stop, maxTokens)
                }
              }
            )

            if (completion.isNullOrBlank()) {
              return
            }

            result.withPrefixMatcher(PlainPrefixMatcher("")).addElement(
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
