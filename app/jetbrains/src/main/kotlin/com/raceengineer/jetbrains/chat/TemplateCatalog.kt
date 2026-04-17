package com.raceengineer.jetbrains.chat

object TemplateCatalog {
  private val builtin = listOf(
    ConversationTemplate(
      id = "chat-en",
      label = "Start Chat",
      title = "Chat",
      systemPrompt = "You are RaceEngineer. Help developer with concise, practical coding guidance."
    ),
    ConversationTemplate(
      id = "explain-code",
      label = "Explain Code",
      title = "Explain Code",
      systemPrompt = "Explain selected code clearly. Focus intent, flow, and risks."
    ),
    ConversationTemplate(
      id = "find-bugs",
      label = "Find Bugs",
      title = "Find Bugs",
      systemPrompt = "Review code and list likely bugs, regressions, and missing tests."
    ),
    ConversationTemplate(
      id = "generate-code",
      label = "Generate Code",
      title = "Generate Code",
      systemPrompt = "Generate implementation code matching requested behavior."
    ),
    ConversationTemplate(
      id = "generate-unit-test",
      label = "Generate Unit Test",
      title = "Generate Unit Test",
      systemPrompt = "Generate focused unit tests for requested code path."
    ),
    ConversationTemplate(
      id = "diagnose-errors",
      label = "Diagnose Errors",
      title = "Diagnose Errors",
      systemPrompt = "Diagnose failures and propose concrete fixes."
    ),
  ).associateBy { it.id }

  fun getTemplate(id: String): ConversationTemplate? = builtin[id]

  fun allTemplates(): Collection<ConversationTemplate> = builtin.values
}
