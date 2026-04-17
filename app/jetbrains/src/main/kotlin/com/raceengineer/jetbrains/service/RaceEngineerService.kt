package com.raceengineer.jetbrains.service

import com.intellij.openapi.components.Service
import com.intellij.openapi.components.service
import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VfsUtilCore
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.openapi.fileEditor.FileEditorManager
import com.raceengineer.jetbrains.chat.ChatConversation
import com.raceengineer.jetbrains.chat.ChatMessage
import com.raceengineer.jetbrains.chat.TemplateCatalog
import com.raceengineer.jetbrains.ollama.OllamaClient
import com.raceengineer.jetbrains.settings.RaceEngineerSettingsState
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.locks.ReentrantLock
import kotlin.concurrent.withLock
import java.nio.file.Path

@Service(Service.Level.PROJECT)
class RaceEngineerService(private val project: Project) {
  private val idCounter = AtomicInteger(0)
  private val conversations = CopyOnWriteArrayList<ChatConversation>()
  private val listeners = CopyOnWriteArrayList<() -> Unit>()
  private val logs = CopyOnWriteArrayList<String>()
  private val conversationLocks = ConcurrentHashMap<String, ReentrantLock>()
  private val busyConversations = ConcurrentHashMap.newKeySet<String>()
  private val workspaceContextResolver = WorkspaceContextResolver()
  @Volatile
  private var selectedConversationId: String? = null

  fun addListener(listener: () -> Unit) {
    listeners.add(listener)
  }

  fun removeListener(listener: () -> Unit) {
    listeners.remove(listener)
  }

  fun allConversations(): List<ChatConversation> = conversations.toList()

  fun allLogs(): List<String> = logs.toList()

  fun isConversationBusy(conversationId: String): Boolean {
    return busyConversations.contains(conversationId)
  }

  fun getSelectedConversationId(): String? = selectedConversationId

  fun setSelectedConversationId(conversationId: String?) {
    if (selectedConversationId == conversationId) {
      return
    }
    selectedConversationId = conversationId
    broadcast()
  }

  fun createConversation(templateId: String): ChatConversation {
    val template = TemplateCatalog.getTemplate(templateId) ?: TemplateCatalog.getTemplate("chat-en")!!
    val conversation = ChatConversation(
      id = "conversation-${idCounter.incrementAndGet()}",
      templateId = template.id,
      title = template.title,
    )
    conversations.add(conversation)
    selectedConversationId = conversation.id
    broadcast()
    return conversation
  }

  fun deleteConversation(conversationId: String) {
    conversations.removeIf { it.id == conversationId }
    if (selectedConversationId == conversationId) {
      selectedConversationId = conversations.firstOrNull()?.id
    }
    broadcast()
  }

  fun sendMessage(conversationId: String, message: String, activeFile: VirtualFile?) {
    val conversation = conversations.find { it.id == conversationId } ?: return
    val template = TemplateCatalog.getTemplate(conversation.templateId) ?: TemplateCatalog.getTemplate("chat-en")!!
    conversation.messages.add(ChatMessage(author = "user", content = message))
    broadcast()

    val lock = conversationLocks.computeIfAbsent(conversationId) { ReentrantLock() }
    lock.withLock {
      busyConversations.add(conversationId)
      broadcast()
      try {
        val context = buildPromptContext(
          userMessage = message,
          activeFile = activeFile,
        )

        val prompt = buildString {
          appendLine(template.systemPrompt)
          appendLine()
          appendLine(context)
          appendLine()
          appendLine("## User Message")
          appendLine(message)
        }

        val settings = RaceEngineerSettingsState.getInstance()
        val ai = OllamaClient(settings)
        logs.add("Sending chat request (${template.id}) to ${settings.providerBaseUrl}")
        val response = ai.chat(prompt)
        conversation.messages.add(ChatMessage(author = "bot", content = response))
        logs.add("Received response (${response.length} chars)")
      } catch (error: Throwable) {
        val errorMessage = error.message?.ifBlank { null } ?: "Unknown error"
        logs.add("Chat request failed: $errorMessage")
        conversation.messages.add(
          ChatMessage(
            author = "bot",
            content = "Request failed: $errorMessage\nCheck RaceEngineer logs/settings and try again."
          )
        )
      } finally {
        busyConversations.remove(conversationId)
        broadcast()
      }
    }
  }

  fun reloadTemplates() {
    logs.add("Template reload requested. Built-in templates active.")
    broadcast()
  }

  private fun readActiveFileSnippet(file: VirtualFile?, maxChars: Int = 1400): String {
    if (file == null || file.isDirectory) {
      return ""
    }
    val text = VfsUtilCore.loadText(file)
    return if (text.length > maxChars) text.take(maxChars) else text
  }

  private fun readFileSnippet(file: VirtualFile, maxChars: Int = 1200): String {
    if (file.isDirectory) {
      return ""
    }
    val text = VfsUtilCore.loadText(file)
    return if (text.length > maxChars) text.take(maxChars) else text
  }

  private fun buildPromptContext(
    userMessage: String,
    activeFile: VirtualFile?,
  ): String {
    val openFiles = FileEditorManager.getInstance(project).openFiles
      .filter { !it.isDirectory }

    val workspaceRoot = project.basePath?.let { Path.of(it) }
    val openFileNames = openFiles.map { it.name }
    val workspaceMentionedFiles = workspaceRoot?.let {
      workspaceContextResolver.findMentionedFiles(it, userMessage, maxFiles = 3)
    } ?: emptyList()
    val activeSnippetMaxChars = if (workspaceMentionedFiles.isEmpty()) 1400 else 800
    val activeSnippet = readActiveFileSnippet(activeFile, activeSnippetMaxChars)
    val referencedFiles = openFiles.filter { file ->
      userMessage.contains(file.name, ignoreCase = true)
    }.take(3)

    return buildString {
      if (openFileNames.isNotEmpty()) {
        appendLine("## Open Files")
        appendLine(openFileNames.joinToString(", "))
        appendLine()
      }

      if (activeFile != null && activeSnippet.isNotBlank()) {
        appendLine("## Active File")
        appendLine(activeFile.path)
        appendLine("```")
        appendLine(activeSnippet)
        appendLine("```")
        appendLine()
      }

      if (referencedFiles.isNotEmpty()) {
        appendLine("## Referenced Files")
        referencedFiles.forEach { file ->
          appendLine(file.path)
          appendLine("```")
          appendLine(readFileSnippet(file))
          appendLine("```")
          appendLine()
        }
      }

      if (workspaceMentionedFiles.isNotEmpty()) {
        appendLine("## Referenced Workspace Files")
        workspaceMentionedFiles.forEach { file ->
          appendLine(file.toString())
          appendLine("```")
          appendLine(workspaceContextResolver.readSnippet(file, maxChars = 1200))
          appendLine("```")
          appendLine()
        }
      }
    }.trim()
  }

  private fun broadcast() {
    listeners.forEach { it.invoke() }
  }

  companion object {
    fun getInstance(project: Project): RaceEngineerService = project.service()
  }
}
