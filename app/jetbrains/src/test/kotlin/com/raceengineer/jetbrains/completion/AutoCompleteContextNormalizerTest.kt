package com.raceengineer.jetbrains.completion

import kotlin.test.Test
import kotlin.test.assertEquals

class AutoCompleteContextNormalizerTest {
  @Test
  fun `replaces cursor marker in prefix`() {
    val (prefix, suffix) = AutoCompleteContextNormalizer.normalize(
      prefix = "def calc_fib(n):\n    # Cursor here",
      suffix = "\nprint(calc_fib(5))",
    )
    assertEquals("def calc_fib(n):\n    ", prefix)
    assertEquals("\nprint(calc_fib(5))", suffix)
  }

  @Test
  fun `drops cursor marker in suffix`() {
    val (_, suffix) = AutoCompleteContextNormalizer.normalize(
      prefix = "def calc_fib(n):\n    ",
      suffix = "# Cursor here\nprint(calc_fib(5))\n",
    )
    assertEquals("print(calc_fib(5))\n", suffix)
  }
}
