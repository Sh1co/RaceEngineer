package com.raceengineer.jetbrains.toolwindow

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.project.Project
import com.intellij.ui.components.JBList
import com.intellij.ui.components.JBScrollPane
import com.intellij.ui.components.JBTextArea
import com.intellij.ui.components.JBTextField
import com.raceengineer.jetbrains.chat.ChatConversation
import com.raceengineer.jetbrains.service.RaceEngineerService
import java.awt.BorderLayout
import java.awt.Dimension
import javax.swing.DefaultListModel
import javax.swing.JButton
import javax.swing.JLabel
import javax.swing.JPanel
import javax.swing.JSplitPane
import javax.swing.ListSelectionModel

class RaceEngineerToolWindowPanel(private val project: Project) : JPanel(BorderLayout()) {
  private val service = RaceEngineerService.getInstance(project)
  private val conversationModel = DefaultListModel<ChatConversation>()
  private val conversationList = JBList(conversationModel)
  private val transcriptArea = JBTextArea()
  private val promptField = JBTextField()
  private val sendButton = JButton("Send")
  private val newChatButton = JButton("New Chat")
  private val deleteButton = JButton("Delete")
  private val activeFile
    get() = FileEditorManager.getInstance(project).selectedFiles.firstOrNull()

  private val listener: () -> Unit = { ApplicationManager.getApplication().invokeLater { render() } }

  init {
    val top = JPanel(BorderLayout())
    val actions = JPanel()
    actions.add(newChatButton)
    actions.add(deleteButton)
    top.add(JLabel("RaceEngineer Chat"), BorderLayout.WEST)
    top.add(actions, BorderLayout.EAST)

    conversationList.selectionMode = ListSelectionModel.SINGLE_SELECTION
    conversationList.cellRenderer = ConversationRenderer()
    val listPane = JBScrollPane(conversationList)
    listPane.preferredSize = Dimension(230, 200)

    transcriptArea.isEditable = false
    transcriptArea.lineWrap = true
    transcriptArea.wrapStyleWord = true
    val transcriptPane = JBScrollPane(transcriptArea)

    val split = JSplitPane(JSplitPane.HORIZONTAL_SPLIT, listPane, transcriptPane)
    split.resizeWeight = 0.25

    val bottom = JPanel(BorderLayout())
    bottom.add(promptField, BorderLayout.CENTER)
    bottom.add(sendButton, BorderLayout.EAST)

    add(top, BorderLayout.NORTH)
    add(split, BorderLayout.CENTER)
    add(bottom, BorderLayout.SOUTH)

    newChatButton.addActionListener {
      val conversation = service.createConversation("chat-en")
      conversationList.setSelectedValue(conversation, true)
    }
    deleteButton.addActionListener {
      val selected = conversationList.selectedValue ?: return@addActionListener
      service.deleteConversation(selected.id)
    }
    sendButton.addActionListener { sendSelectedConversationPrompt() }
    promptField.addActionListener { sendSelectedConversationPrompt() }
    conversationList.addListSelectionListener { renderSelectedConversation() }

    service.addListener(listener)
    if (service.allConversations().isEmpty()) {
      val conversation = service.createConversation("chat-en")
      conversationList.setSelectedValue(conversation, true)
    } else {
      render()
    }
  }

  override fun removeNotify() {
    service.removeListener(listener)
    super.removeNotify()
  }

  private fun sendSelectedConversationPrompt() {
    val selected = conversationList.selectedValue ?: return
    val prompt = promptField.text.trim()
    if (prompt.isBlank()) {
      return
    }
    promptField.text = ""
    ApplicationManager.getApplication().executeOnPooledThread {
      service.sendMessage(selected.id, prompt, activeFile)
    }
  }

  private fun render() {
    val selectedId = conversationList.selectedValue?.id
    conversationModel.clear()
    service.allConversations().forEach { conversationModel.addElement(it) }
    val nextSelection = service.allConversations().find { it.id == selectedId } ?: service.allConversations().firstOrNull()
    if (nextSelection != null) {
      conversationList.setSelectedValue(nextSelection, true)
    }
    renderSelectedConversation()
  }

  private fun renderSelectedConversation() {
    val selected = conversationList.selectedValue
    if (selected == null) {
      transcriptArea.text = ""
      return
    }

    val text = buildString {
      selected.messages.forEach { message ->
        appendLine(if (message.author == "user") "You:" else "RaceEngineer:")
        appendLine(message.content)
        appendLine()
      }
    }
    transcriptArea.text = text
    transcriptArea.caretPosition = transcriptArea.document.length
  }
}
