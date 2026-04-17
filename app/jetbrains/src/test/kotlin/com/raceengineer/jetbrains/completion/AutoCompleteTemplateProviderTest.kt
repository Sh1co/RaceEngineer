package com.raceengineer.jetbrains.completion

import kotlin.test.Test
import kotlin.test.assertContains
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class AutoCompleteTemplateProviderTest {
  @Test
  fun `uses deepseek tokens`() {
    val strategy = AutoCompleteTemplateProvider.getStrategy(
      model = "deepseek-coder:1.3b",
      provider = "Ollama",
      additionalContext = "// ctx",
      prefix = "const x = ",
      suffix = ";",
    )
    assertTrue(strategy is AutoCompleteStrategy.Prompt)
    strategy as AutoCompleteStrategy.Prompt
    assertContains(strategy.prompt, "<｜fim▁begin｜>")
    assertContains(strategy.prompt, "<｜fim▁hole｜>")
    assertContains(strategy.prompt, "<｜fim▁end｜>")
  }

  @Test
  fun `uses qwen infill on ollama`() {
    val strategy = AutoCompleteTemplateProvider.getStrategy(
      model = "qwen2.5-coder:1.5b",
      provider = "Ollama",
      additionalContext = "",
      prefix = "def calc():\n    ",
      suffix = "",
    )
    assertTrue(strategy is AutoCompleteStrategy.Infill)
    strategy as AutoCompleteStrategy.Infill
    assertEquals("def calc():\n    ", strategy.prefix)
  }

  @Test
  fun `uses qwen prompt fallback on non ollama`() {
    val strategy = AutoCompleteTemplateProvider.getStrategy(
      model = "qwen2.5-coder:1.5b",
      provider = "llama.cpp",
      additionalContext = "",
      prefix = "const x = ",
      suffix = ";",
    )
    assertTrue(strategy is AutoCompleteStrategy.Prompt)
    strategy as AutoCompleteStrategy.Prompt
    assertContains(strategy.prompt, "<|fim_prefix|>")
    assertContains(strategy.prompt, "<|fim_suffix|>")
    assertContains(strategy.prompt, "<|fim_middle|>")
  }
}
