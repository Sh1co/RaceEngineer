package com.raceengineer.jetbrains.chat

import java.util.concurrent.CopyOnWriteArrayList

data class ChatMessage(
  val author: String,
  val content: String,
)

data class ChatConversation(
  val id: String,
  val templateId: String,
  val title: String,
  val messages: MutableList<ChatMessage> = CopyOnWriteArrayList(),
)

data class ConversationTemplate(
  val id: String,
  val label: String,
  val title: String,
  val systemPrompt: String,
)
