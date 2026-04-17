package com.raceengineer.jetbrains.completion

import com.intellij.codeInsight.completion.*
import com.intellij.codeInsight.lookup.LookupElementBuilder
import com.intellij.patterns.PlatformPatterns
import com.intellij.util.ProcessingContext
import com.raceengineer.jetbrains.ollama.OllamaClient
import com.raceengineer.jetbrains.settings.RaceEngineerSettingsState

class RaceEngineerCompletionContributor : CompletionContributor() {
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

          val editor = parameters.editor
          val document = editor.document
          val offset = parameters.offset

          val fullText = document.text
          val prefix = fullText.substring(0, offset)
          val suffix = fullText.substring(offset)
          val normalized = AutoCompleteContextNormalizer.normalize(prefix, suffix)
          val additionalContext = buildAdditionalContext(parameters.position.language.displayName, parameters.originalFile.virtualFile?.path)

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
        }
      }
    )
  }

  private fun buildAdditionalContext(language: String, filePath: String?): String {
    val languageLine = "// Language: $language"
    val fileLine = if (filePath.isNullOrBlank()) "" else "// File uri: $filePath"
    return listOf(languageLine, fileLine).filter { it.isNotBlank() }.joinToString("\n")
  }
}
