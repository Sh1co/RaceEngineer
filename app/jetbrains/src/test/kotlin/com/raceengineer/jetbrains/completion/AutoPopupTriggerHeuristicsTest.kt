package com.raceengineer.jetbrains.completion

import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class AutoPopupTriggerHeuristicsTest {
  @Test
  fun `triggers on common coding characters`() {
    assertTrue(AutoPopupTriggerHeuristics.shouldTrigger('a'))
    assertTrue(AutoPopupTriggerHeuristics.shouldTrigger('9'))
    assertTrue(AutoPopupTriggerHeuristics.shouldTrigger('_'))
    assertTrue(AutoPopupTriggerHeuristics.shouldTrigger('.'))
    assertTrue(AutoPopupTriggerHeuristics.shouldTrigger(':'))
    assertTrue(AutoPopupTriggerHeuristics.shouldTrigger('>'))
    assertTrue(AutoPopupTriggerHeuristics.shouldTrigger('\n'))
  }

  @Test
  fun `does not trigger on punctuation noise`() {
    assertFalse(AutoPopupTriggerHeuristics.shouldTrigger(' '))
    assertFalse(AutoPopupTriggerHeuristics.shouldTrigger(','))
    assertFalse(AutoPopupTriggerHeuristics.shouldTrigger(';'))
    assertFalse(AutoPopupTriggerHeuristics.shouldTrigger(')'))
  }
}
