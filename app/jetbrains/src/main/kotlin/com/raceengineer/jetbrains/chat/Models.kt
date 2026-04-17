package com.raceengineer.jetbrains.chat

data class ChatMessage(
  val author: String,
  val content: String,
)

data class ChatConversation(
  val id: String,
  val templateId: String,
  val title: String,
  val messages: MutableList<ChatMessage> = mutableListOf(),
)

data class ConversationTemplate(
  val id: String,
  val label: String,
  val title: String,
  val systemPrompt: String,
)
