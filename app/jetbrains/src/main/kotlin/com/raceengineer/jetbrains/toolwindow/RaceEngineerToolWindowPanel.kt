package com.raceengineer.jetbrains.toolwindow

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.project.Project
import com.intellij.ui.jcef.JBCefApp
import com.intellij.ui.jcef.JBCefBrowser
import com.intellij.ui.jcef.JBCefJSQuery
import com.raceengineer.jetbrains.chat.ChatConversation
import com.raceengineer.jetbrains.service.RaceEngineerService
import java.awt.BorderLayout
import javax.swing.JLabel
import javax.swing.JPanel

class RaceEngineerToolWindowPanel(private val project: Project) : JPanel(BorderLayout()) {
  private val service = RaceEngineerService.getInstance(project)
  private val mapper = jacksonObjectMapper()
  private var browser: JBCefBrowser? = null
  private var jsQuery: JBCefJSQuery? = null
  private val activeFile
    get() = FileEditorManager.getInstance(project).selectedFiles.firstOrNull()

  private val listener: () -> Unit = {
    ApplicationManager.getApplication().invokeLater {
      pushStateToWebview()
    }
  }

  init {
    if (!JBCefApp.isSupported()) {
      add(JLabel("RaceEngineer UI requires JCEF support in this IDE/runtime."), BorderLayout.CENTER)
    } else {
      val localBrowser = JBCefBrowser()
      browser = localBrowser
      val localQuery = JBCefJSQuery.create(localBrowser)
      jsQuery = localQuery

      localQuery.addHandler { payload ->
        handleUiMessage(payload)
        null
      }

      val html = loadChatHtml().replace("__RACEENGINEER_JS_QUERY__", localQuery.inject("payload"))
      localBrowser.loadHTML(html)
      add(localBrowser.component, BorderLayout.CENTER)

      service.addListener(listener)
      if (service.allConversations().isEmpty()) {
        service.createConversation("chat-en")
      } else if (service.getSelectedConversationId() == null) {
        service.setSelectedConversationId(service.allConversations().firstOrNull()?.id)
      }
      ApplicationManager.getApplication().invokeLater { pushStateToWebview() }
    }
  }

  override fun removeNotify() {
    service.removeListener(listener)
    jsQuery?.dispose()
    browser?.dispose()
    super.removeNotify()
  }

  private fun handleUiMessage(payload: String) {
    val root = mapper.readTree(payload)
    val type = root.get("type")?.asText().orEmpty()
    when (type) {
      "startChat" -> {
        val conversation = service.createConversation("chat-en")
        service.setSelectedConversationId(conversation.id)
        pushStateToWebview()
      }

      "deleteConversation" -> {
        val conversationId = root.get("conversationId")?.asText()
        if (!conversationId.isNullOrBlank()) {
          service.deleteConversation(conversationId)
          pushStateToWebview()
        }
      }

      "selectConversation" -> {
        val conversationId = root.get("conversationId")?.asText()
        if (!conversationId.isNullOrBlank()) {
          service.setSelectedConversationId(conversationId)
          pushStateToWebview()
        }
      }

      "sendMessage" -> {
        val prompt = root.get("message")?.asText()?.trim().orEmpty()
        if (prompt.isBlank()) {
          return
        }
        val conversationId = root.get("conversationId")?.asText()
          ?: service.getSelectedConversationId()
          ?: service.allConversations().firstOrNull()?.id
          ?: service.createConversation("chat-en").id
        service.setSelectedConversationId(conversationId)
        ApplicationManager.getApplication().executeOnPooledThread {
          service.sendMessage(conversationId, prompt, activeFile)
        }
      }

      "reloadTemplates" -> {
        service.reloadTemplates()
      }

      "showLogs" -> {
        val logBody = if (service.allLogs().isEmpty()) "No logs yet." else service.allLogs().joinToString("\n")
        com.intellij.openapi.ui.Messages.showInfoMessage(project, logBody, "RaceEngineer Logs")
      }
    }
  }

  private fun pushStateToWebview() {
    val localBrowser = browser ?: return
    val conversations = service.allConversations()
    var selectedConversationId = service.getSelectedConversationId()
    if (selectedConversationId == null) {
      selectedConversationId = conversations.firstOrNull()?.id
      service.setSelectedConversationId(selectedConversationId)
    }
    val selected = conversations.find { it.id == selectedConversationId } ?: conversations.firstOrNull()
    if (selected != null) {
      selectedConversationId = selected.id
      if (service.getSelectedConversationId() != selectedConversationId) {
        service.setSelectedConversationId(selectedConversationId)
      }
    }

    val state = mapOf(
      "selectedConversationId" to selectedConversationId,
      "conversations" to conversations.map { conversation ->
        mapOf(
          "id" to conversation.id,
          "title" to conversation.title,
          "templateId" to conversation.templateId,
          "busy" to service.isConversationBusy(conversation.id),
          "messages" to conversation.messages.map { message ->
            mapOf(
              "author" to message.author,
              "content" to message.content
            )
          }
        )
      }
    )

    val json = mapper.writeValueAsString(state)
    localBrowser.cefBrowser.executeJavaScript(
      "window.raceEngineerUpdateState($json);",
      localBrowser.cefBrowser.url,
      0
    )
  }

  private fun loadChatHtml(): String {
    val stream = javaClass.getResourceAsStream("/web/chat.html")
      ?: error("Missing chat web resource")
    return stream.bufferedReader(Charsets.UTF_8).use { it.readText() }
  }
}
