package com.raceengineer.jetbrains.ollama

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.raceengineer.jetbrains.settings.RaceEngineerSettingsState
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import java.util.concurrent.TimeUnit
import kotlin.test.AfterTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

class OllamaClientTest {
  private val server = MockWebServer()
  private val mapper = jacksonObjectMapper()

  @AfterTest
  fun tearDown() {
    server.shutdown()
  }

  @Test
  fun `sends infill payload with suffix`() {
    server.start()
    server.enqueue(MockResponse().setResponseCode(200).setBody("""{"response":"return a + b;"}"""))
    val settings = RaceEngineerSettingsState().apply {
      providerBaseUrl = server.url("/").toString().trimEnd('/')
      autocompleteModel = "qwen2.5-coder:1.5b"
    }
    val client = OllamaClient(settings, OkHttpClient(), mapper)
    val response = client.infill("const sum = ", ";", 24)

    assertEquals("return a + b;", response)
    val req = server.takeRequest()
    val json = mapper.readTree(req.body.readUtf8())
    assertEquals("const sum = ", json.get("prompt").asText())
    assertEquals(";", json.get("suffix").asText())
  }

  @Test
  fun `uses newline suffix fallback at eof`() {
    server.start()
    server.enqueue(MockResponse().setResponseCode(200).setBody("""{"response":"return n"}"""))
    val settings = RaceEngineerSettingsState().apply {
      providerBaseUrl = server.url("/").toString().trimEnd('/')
    }
    val client = OllamaClient(settings, OkHttpClient(), mapper)
    client.infill("def calc_fib(n):\n    ", "", 32)

    val req = server.takeRequest()
    val json = mapper.readTree(req.body.readUtf8())
    assertEquals("\n", json.get("suffix").asText())
  }

  @Test
  fun `retries low value python eof infill with return hint`() {
    server.start()
    server.enqueue(MockResponse().setResponseCode(200).setBody("""{"response":"obj['SUF']"}"""))
    server.enqueue(MockResponse().setResponseCode(200).setBody("""{"response":"if n <= 1:\n        return n"}"""))
    val settings = RaceEngineerSettingsState().apply {
      providerBaseUrl = server.url("/").toString().trimEnd('/')
    }
    val client = OllamaClient(settings, OkHttpClient(), mapper)
    val response = client.infill("def calc_fib(n):\n    ", "", 64)
    assertTrue(response.contains("return"))

    val first = mapper.readTree(server.takeRequest().body.readUtf8())
    val second = mapper.readTree(server.takeRequest().body.readUtf8())
    assertEquals("\n", first.get("suffix").asText())
    assertEquals("\nreturn", second.get("suffix").asText())
  }

  @Test
  fun `chat returns assistant message`() {
    server.start()
    server.enqueue(
      MockResponse().setResponseCode(200).setBody(
        """{"message":{"role":"assistant","content":"Hello from model"}}"""
      )
    )

    val settings = RaceEngineerSettingsState().apply {
      providerBaseUrl = server.url("/").toString().trimEnd('/')
    }
    val client = OllamaClient(settings, OkHttpClient(), mapper)
    val response = client.chat("Say hello")

    assertEquals("Hello from model", response)
  }

  @Test
  fun `chat retries once after timeout and succeeds on second response`() {
    server.start()
    server.enqueue(
      MockResponse()
        .setResponseCode(200)
        .setBody("""{"message":{"role":"assistant","content":"too late"}}""")
        .setBodyDelay(2, TimeUnit.SECONDS)
    )
    server.enqueue(
      MockResponse()
        .setResponseCode(200)
        .setBody("""{"message":{"role":"assistant","content":"second attempt works"}}""")
    )

    val settings = RaceEngineerSettingsState().apply {
      providerBaseUrl = server.url("/").toString().trimEnd('/')
      requestTimeoutSeconds = 1
    }
    val client = OllamaClient(settings)
    val response = client.chat("retry please")

    assertEquals("second attempt works", response)
    assertEquals(2, server.requestCount)
  }

  @Test
  fun `chat times out when model response exceeds configured timeout`() {
    server.start()
    server.enqueue(
      MockResponse()
        .setResponseCode(200)
        .setBody("""{"message":{"role":"assistant","content":"late"}}""")
        .setBodyDelay(2, TimeUnit.SECONDS)
    )
    server.enqueue(
      MockResponse()
        .setResponseCode(200)
        .setBody("""{"message":{"role":"assistant","content":"late-again"}}""")
        .setBodyDelay(2, TimeUnit.SECONDS)
    )

    val settings = RaceEngineerSettingsState().apply {
      providerBaseUrl = server.url("/").toString().trimEnd('/')
      requestTimeoutSeconds = 1
    }
    val client = OllamaClient(settings)

    assertFailsWith<Exception> {
      client.chat("slow")
    }

    assertEquals(2, server.requestCount)
  }
}
