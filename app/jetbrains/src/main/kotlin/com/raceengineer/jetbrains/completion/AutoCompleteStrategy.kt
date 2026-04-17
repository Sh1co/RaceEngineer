package com.raceengineer.jetbrains.completion

sealed interface AutoCompleteStrategy {
  data class Prompt(
    val prompt: String,
    val stop: List<String>,
    val maxTokens: Int = 256,
  ) : AutoCompleteStrategy

  data class Infill(
    val prefix: String,
    val suffix: String,
    val stop: List<String> = emptyList(),
    val maxTokens: Int = 256,
  ) : AutoCompleteStrategy
}

object AutoCompleteTemplateProvider {
  private const val DEEPSEEK_FIM_BEGIN = "<｜fim▁begin｜>"
  private const val DEEPSEEK_FIM_HOLE = "<｜fim▁hole｜>"
  private const val DEEPSEEK_FIM_END = "<｜fim▁end｜>"
  private const val QWEN_FIM_PREFIX = "<|fim_prefix|>"
  private const val QWEN_FIM_SUFFIX = "<|fim_suffix|>"
  private const val QWEN_FIM_MIDDLE = "<|fim_middle|>"

  fun getStrategy(
    model: String,
    provider: String,
    additionalContext: String,
    prefix: String,
    suffix: String,
  ): AutoCompleteStrategy {
    val prefixWithContext = if (additionalContext.isBlank()) prefix else "$additionalContext\n$prefix"

    if (model.startsWith("qwen2.5-coder")) {
      if (provider == "Ollama") {
        return AutoCompleteStrategy.Infill(prefix = prefix, suffix = suffix)
      }
      return AutoCompleteStrategy.Prompt(
        prompt = "$QWEN_FIM_PREFIX$prefixWithContext$QWEN_FIM_SUFFIX$suffix$QWEN_FIM_MIDDLE",
        stop = listOf(QWEN_FIM_PREFIX, QWEN_FIM_SUFFIX, QWEN_FIM_MIDDLE),
      )
    }

    if (model.startsWith("deepseek")) {
      return AutoCompleteStrategy.Prompt(
        prompt = "$DEEPSEEK_FIM_BEGIN$prefixWithContext$DEEPSEEK_FIM_HOLE$suffix$DEEPSEEK_FIM_END",
        stop = listOf(DEEPSEEK_FIM_BEGIN, DEEPSEEK_FIM_HOLE, DEEPSEEK_FIM_END, "<END>"),
      )
    }

    if (model.startsWith("stable-code")) {
      return AutoCompleteStrategy.Prompt(
        prompt = "<fim_prefix>$prefixWithContext<fim_suffix>$suffix<fim_middle>",
        stop = listOf("<|endoftext|>"),
      )
    }

    return AutoCompleteStrategy.Prompt(
      prompt = "<PRE> $prefixWithContext <SUF>$suffix <MID>",
      stop = listOf("<PRE>", "<SUF>", "<MID>", "<END>", "EOT"),
    )
  }
}
