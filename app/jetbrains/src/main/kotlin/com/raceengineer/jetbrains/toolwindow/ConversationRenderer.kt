package com.raceengineer.jetbrains.toolwindow

import com.intellij.ui.SimpleListCellRenderer
import com.raceengineer.jetbrains.chat.ChatConversation
import javax.swing.JList

class ConversationRenderer : SimpleListCellRenderer<ChatConversation>() {
  override fun customize(
    list: JList<out ChatConversation>,
    value: ChatConversation?,
    index: Int,
    selected: Boolean,
    hasFocus: Boolean
  ) {
    text = value?.title ?: "Conversation"
  }
}
