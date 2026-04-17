package com.raceengineer.jetbrains.completion

import com.raceengineer.jetbrains.settings.RaceEngineerSettingsState
import kotlin.test.Test
import kotlin.test.assertContains
import kotlin.test.assertEquals
import kotlin.test.assertNull

class RaceEngineerCompletionEngineTest {
  @Test
  fun `automatic qwen on ollama uses infill and returns sanitized text`() {
    val engine = RaceEngineerCompletionEngine(nowProvider = { 1000L })
    val settings = defaultSettings()
    val fake = FakeGenerator(
      infillResponse = "<|fim_middle|>return value;<END>",
      promptResponse = "unused",
    )

    val result = engine.complete(
      input = CompletionEngineInput(
        settings = settings,
        invocationCount = 0,
        editorKey = "editor-1",
        language = "Python",
        filePath = "/repo/main.py",
        prefix = "def calc(value):\n    ",
        suffix = "\n",
      ),
      generator = fake,
    )

    assertEquals("return value;", result)
    assertEquals(1, fake.infillCalls)
    assertEquals(0, fake.promptCalls)
  }

  @Test
  fun `manual mode skips automatic invocation`() {
    val engine = RaceEngineerCompletionEngine(nowProvider = { 1000L })
    val settings = defaultSettings().apply {
      autocompleteMode = "manual"
    }
    val fake = FakeGenerator("return value", "return value")

    val result = engine.complete(
      input = CompletionEngineInput(
        settings = settings,
        invocationCount = 0,
        editorKey = "editor-2",
        language = "C#",
        filePath = "C:/repo/a.cs",
        prefix = "public int Sum(int a, int b) { return ",
        suffix = "; }",
      ),
      generator = fake,
    )

    assertNull(result)
    assertEquals(0, fake.infillCalls)
    assertEquals(0, fake.promptCalls)
  }

  @Test
  fun `debounce blocks too-frequent requests for same editor key`() {
    var now = 1000L
    val engine = RaceEngineerCompletionEngine(nowProvider = { now })
    val settings = defaultSettings().apply {
      autocompleteDebounceWait = 300
    }
    val fake = FakeGenerator("return a + b", "return a + b")

    val first = engine.complete(
      input = CompletionEngineInput(
        settings = settings,
        invocationCount = 1,
        editorKey = "editor-3",
        language = "JavaScript",
        filePath = "/repo/a.js",
        prefix = "function sum(a,b){ return ",
        suffix = "; }",
      ),
      generator = fake,
    )
    now = 1100L
    val second = engine.complete(
      input = CompletionEngineInput(
        settings = settings,
        invocationCount = 1,
        editorKey = "editor-3",
        language = "JavaScript",
        filePath = "/repo/a.js",
        prefix = "function sum(a,b){ return ",
        suffix = "; }",
      ),
      generator = fake,
    )

    assertEquals("a + b", first)
    assertNull(second)
    assertEquals(1, fake.infillCalls)
  }

  @Test
  fun `deepseek model uses prompt completion strategy`() {
    val engine = RaceEngineerCompletionEngine(nowProvider = { 1000L })
    val settings = defaultSettings().apply {
      autocompleteModel = "deepseek-coder:1.3b"
    }
    val fake = FakeGenerator("unused", "return x + y;")

    val result = engine.complete(
      input = CompletionEngineInput(
        settings = settings,
        invocationCount = 1,
        editorKey = "editor-4",
        language = "TypeScript",
        filePath = "/repo/a.ts",
        prefix = "const x = ",
        suffix = ";",
      ),
      generator = fake,
    )

    assertEquals("return x + y", result)
    assertEquals(0, fake.infillCalls)
    assertEquals(1, fake.promptCalls)
    assertContains(fake.lastPrompt.orEmpty(), "<｜fim▁begin｜>")
  }

  private fun defaultSettings(): RaceEngineerSettingsState {
    return RaceEngineerSettingsState().apply {
      provider = "Ollama"
      autocompleteMode = "automatic"
      autocompleteModel = "qwen2.5-coder:1.5b"
      autocompleteDebounceWait = 300
    }
  }

  private class FakeGenerator(
    private val infillResponse: String,
    private val promptResponse: String,
  ) : CompletionTextGenerator {
    var infillCalls: Int = 0
    var promptCalls: Int = 0
    var lastPrompt: String? = null

    override fun infill(prefix: String, suffix: String, maxTokens: Int): String {
      infillCalls += 1
      return infillResponse
    }

    override fun promptComplete(prompt: String, stop: List<String>, maxTokens: Int): String {
      promptCalls += 1
      lastPrompt = prompt
      return promptResponse
    }
  }
}
