package com.raceengineer.jetbrains.service

import com.intellij.openapi.components.Service
import com.intellij.openapi.components.service
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VfsUtilCore
import com.intellij.openapi.vfs.VirtualFile
import com.raceengineer.jetbrains.chat.ChatConversation
import com.raceengineer.jetbrains.chat.ChatMessage
import com.raceengineer.jetbrains.chat.TemplateCatalog
import com.raceengineer.jetbrains.ollama.OllamaClient
import com.raceengineer.jetbrains.settings.RaceEngineerSettingsState
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.atomic.AtomicInteger

@Service(Service.Level.PROJECT)
class RaceEngineerService(private val project: Project) {
  private val idCounter = AtomicInteger(0)
  private val conversations = CopyOnWriteArrayList<ChatConversation>()
  private val listeners = CopyOnWriteArrayList<() -> Unit>()
  private val logs = CopyOnWriteArrayList<String>()

  fun addListener(listener: () -> Unit) {
    listeners.add(listener)
  }

  fun removeListener(listener: () -> Unit) {
    listeners.remove(listener)
  }

  fun allConversations(): List<ChatConversation> = conversations.toList()

  fun allLogs(): List<String> = logs.toList()

  fun createConversation(templateId: String): ChatConversation {
    val template = TemplateCatalog.getTemplate(templateId) ?: TemplateCatalog.getTemplate("chat-en")!!
    val conversation = ChatConversation(
      id = "conversation-${idCounter.incrementAndGet()}",
      templateId = template.id,
      title = template.title,
    )
    conversations.add(conversation)
    broadcast()
    return conversation
  }

  fun deleteConversation(conversationId: String) {
    conversations.removeIf { it.id == conversationId }
    broadcast()
  }

  fun sendMessage(conversationId: String, message: String, activeFile: VirtualFile?) {
    val conversation = conversations.find { it.id == conversationId } ?: return
    val template = TemplateCatalog.getTemplate(conversation.templateId) ?: TemplateCatalog.getTemplate("chat-en")!!
    conversation.messages.add(ChatMessage(author = "user", content = message))

    val selectedContext = readActiveFileSnippet(activeFile)
    val prompt = buildString {
      appendLine(template.systemPrompt)
      appendLine()
      if (selectedContext.isNotBlank()) {
        appendLine("## Active File Context")
        appendLine(selectedContext)
        appendLine()
      }
      appendLine("## User Message")
      appendLine(message)
    }

    val settings = RaceEngineerSettingsState.getInstance()
    val ai = OllamaClient(settings)
    logs.add("Sending chat request (${template.id}) to ${settings.providerBaseUrl}")
    val response = ai.chat(prompt)
    conversation.messages.add(ChatMessage(author = "bot", content = response))
    logs.add("Received response (${response.length} chars)")
    broadcast()
  }

  fun reloadTemplates() {
    logs.add("Template reload requested. Built-in templates active.")
    broadcast()
  }

  private fun readActiveFileSnippet(file: VirtualFile?): String {
    if (file == null || file.isDirectory) {
      return ""
    }
    val text = VfsUtilCore.loadText(file)
    return if (text.length > 3000) text.take(3000) else text
  }

  private fun broadcast() {
    listeners.forEach { it.invoke() }
  }

  companion object {
    fun getInstance(project: Project): RaceEngineerService = project.service()
  }
}
