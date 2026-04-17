package com.raceengineer.jetbrains.completion

import kotlin.test.Test
import kotlin.test.assertEquals

class AutoCompleteSanitizerTest {
  @Test
  fun `removes control tokens`() {
    val raw = "<|fim_middle|>return x + y;<END><｜fim▁hole｜><|endoftext|>"
    assertEquals("return x + y;", AutoCompleteSanitizer.sanitize(raw))
  }

  @Test
  fun `drops known placeholders`() {
    assertEquals("", AutoCompleteSanitizer.sanitize("obj['middle_code']"))
    assertEquals("", AutoCompleteSanitizer.sanitize("obj['SUF']"))
  }

  @Test
  fun `truncates full file spill tail`() {
    val raw = listOf(
      "return max(min_value, min(max_value, value))",
      "",
      "In the provided code snippet...",
    ).joinToString("\n")
    assertEquals("return max(min_value, min(max_value, value))", AutoCompleteSanitizer.sanitize(raw))
  }
}
