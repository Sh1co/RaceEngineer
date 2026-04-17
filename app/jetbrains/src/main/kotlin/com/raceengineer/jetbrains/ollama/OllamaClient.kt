package com.raceengineer.jetbrains.ollama

import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.raceengineer.jetbrains.settings.RaceEngineerSettingsState
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody

data class ChatRequest(
  val model: String,
  val messages: List<Map<String, String>>,
  val think: Boolean,
  val stream: Boolean,
  val options: Map<String, Any>
)

data class InfillRequest(
  val model: String,
  val prompt: String,
  val suffix: String,
  val stream: Boolean,
  val options: Map<String, Any>
)

class OllamaClient(
  private val settings: RaceEngineerSettingsState,
  private val http: OkHttpClient = OkHttpClient(),
  private val mapper: ObjectMapper = jacksonObjectMapper(),
) {
  fun chat(userPrompt: String, maxTokens: Int = 1024): String {
    val body = ChatRequest(
      model = settings.effectiveChatModel(),
      messages = listOf(
        mapOf("role" to "system", "content" to "You are a Bot who is here to assist Developer."),
        mapOf("role" to "user", "content" to userPrompt),
      ),
      think = settings.enableThinking,
      stream = false,
      options = mapOf("temperature" to 0, "num_predict" to maxTokens),
    )
    val request = Request.Builder()
      .url("${settings.providerBaseUrl.trimEnd('/')}/api/chat")
      .post(mapper.writeValueAsString(body).toRequestBody("application/json".toMediaType()))
      .build()
    http.newCall(request).execute().use { response ->
      if (!response.isSuccessful) {
        error("Chat request failed with status ${response.code}")
      }
      val node = mapper.readTree(response.body?.string().orEmpty())
      val error = node.get("error")?.asText()
      if (!error.isNullOrBlank()) {
        error(error)
      }
      return node.get("message")?.get("content")?.asText().orEmpty()
    }
  }

  fun infill(prefix: String, suffix: String, maxTokens: Int = 256): String {
    val suffixCandidates = mutableListOf(if (suffix.isEmpty()) "\n" else suffix)
    if (suffix.isEmpty() && Regex("""def\s+[A-Za-z_]\w*\s*\([^)]*\)\s*:\s*\n[ \t]*$""").containsMatchIn(prefix)) {
      suffixCandidates.add("\nreturn")
    }

    var last = ""
    for (candidate in suffixCandidates) {
      val body = InfillRequest(
        model = settings.autocompleteModel,
        prompt = prefix,
        suffix = candidate,
        stream = false,
        options = mapOf("temperature" to 0, "num_predict" to maxTokens),
      )
      val request = Request.Builder()
        .url("${settings.providerBaseUrl.trimEnd('/')}/api/generate")
        .post(mapper.writeValueAsString(body).toRequestBody("application/json".toMediaType()))
        .build()
      http.newCall(request).execute().use { response ->
        if (!response.isSuccessful) {
          error("Infill request failed with status ${response.code}")
        }
        val node = mapper.readTree(response.body?.string().orEmpty())
        val error = node.get("error")?.asText()
        if (!error.isNullOrBlank()) {
          error(error)
        }
        last = node.get("response")?.asText().orEmpty()
        if (!isLowValueResponse(last, prefix)) {
          return last
        }
      }
    }
    return last
  }

  fun promptComplete(prompt: String, stop: List<String>, maxTokens: Int = 256): String {
    val body = mapOf(
      "model" to settings.autocompleteModel,
      "prompt" to prompt,
      "stream" to false,
      "options" to mapOf(
        "temperature" to 0,
        "num_predict" to maxTokens,
        "stop" to stop
      )
    )
    val request = Request.Builder()
      .url("${settings.providerBaseUrl.trimEnd('/')}/api/generate")
      .post(mapper.writeValueAsString(body).toRequestBody("application/json".toMediaType()))
      .build()
    http.newCall(request).execute().use { response ->
      if (!response.isSuccessful) {
        error("Completion request failed with status ${response.code}")
      }
      val node = mapper.readTree(response.body?.string().orEmpty())
      val error = node.get("error")?.asText()
      if (!error.isNullOrBlank()) {
        error(error)
      }
      return node.get("response")?.asText().orEmpty()
    }
  }

  private fun isLowValueResponse(response: String, prefix: String): Boolean {
    val trimmed = response.trim()
    if (trimmed.isEmpty()) return true
    if (trimmed.equals("obj['SUF']", true)) return true
    if (trimmed.equals("obj['middle_code']", true)) return true
    if (trimmed == prefix.trim()) return true
    return false
  }
}
