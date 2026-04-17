package com.raceengineer.jetbrains.settings

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.PersistentStateComponent
import com.intellij.openapi.components.State
import com.intellij.openapi.components.Storage

@State(name = "RaceEngineerSettings", storages = [Storage("raceengineer.xml")])
class RaceEngineerSettingsState : PersistentStateComponent<RaceEngineerSettingsState> {
  var provider: String = "Ollama"
  var providerBaseUrl: String = "http://localhost:11434"
  var autocompleteMode: String = "automatic"
  var autocompleteModel: String = "qwen2.5-coder:1.5b"
  var autocompleteDebounceWait: Int = 300
  var chatModel: String = "custom"
  var customModel: String = "qwen3.5:9b"
  var enableThinking: Boolean = false

  override fun getState(): RaceEngineerSettingsState = this

  override fun loadState(state: RaceEngineerSettingsState) {
    provider = state.provider
    providerBaseUrl = state.providerBaseUrl
    autocompleteMode = state.autocompleteMode
    autocompleteModel = state.autocompleteModel
    autocompleteDebounceWait = state.autocompleteDebounceWait
    chatModel = state.chatModel
    customModel = state.customModel
    enableThinking = state.enableThinking
  }

  fun effectiveChatModel(): String {
    return if (chatModel == "custom") customModel else chatModel
  }

  companion object {
    fun getInstance(): RaceEngineerSettingsState {
      return ApplicationManager.getApplication().getService(RaceEngineerSettingsState::class.java)
        ?: RaceEngineerSettingsState()
    }
  }
}
