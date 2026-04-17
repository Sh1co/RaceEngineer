package com.raceengineer.jetbrains.settings

import com.intellij.openapi.options.Configurable
import com.intellij.ui.components.JBCheckBox
import com.intellij.ui.components.JBTextField
import com.intellij.util.ui.FormBuilder
import javax.swing.JComboBox
import javax.swing.JComponent

class RaceEngineerConfigurable : Configurable {
  private fun state(): RaceEngineerSettingsState = RaceEngineerSettingsState.getInstance()

  private lateinit var provider: JComboBox<String>
  private lateinit var providerBaseUrl: JBTextField
  private lateinit var autocompleteMode: JComboBox<String>
  private lateinit var autocompleteModel: JBTextField
  private lateinit var autocompleteDebounceWait: JBTextField
  private lateinit var requestTimeoutSeconds: JBTextField
  private lateinit var chatModel: JComboBox<String>
  private lateinit var customModel: JBTextField
  private lateinit var enableThinking: JBCheckBox
  private var root: JComponent? = null

  override fun getDisplayName(): String = "RaceEngineer"

  override fun createComponent(): JComponent {
    provider = JComboBox(arrayOf("Ollama"))
    providerBaseUrl = JBTextField()
    autocompleteMode = JComboBox(arrayOf("automatic", "manual", "disabled"))
    autocompleteModel = JBTextField()
    autocompleteDebounceWait = JBTextField()
    requestTimeoutSeconds = JBTextField()
    chatModel = JComboBox(arrayOf("mistral:instruct", "codellama:instruct", "custom"))
    customModel = JBTextField()
    enableThinking = JBCheckBox("Enable chat thinking")

    root = FormBuilder.createFormBuilder()
      .addLabeledComponent("raceengineer.provider", provider)
      .addLabeledComponent("raceengineer.providerBaseUrl", providerBaseUrl)
      .addLabeledComponent("raceengineer.autocomplete.mode", autocompleteMode)
      .addLabeledComponent("raceengineer.autocomplete.model", autocompleteModel)
      .addLabeledComponent("raceengineer.autocomplete.debounceWait", autocompleteDebounceWait)
      .addLabeledComponent("raceengineer.requestTimeoutSeconds", requestTimeoutSeconds)
      .addLabeledComponent("raceengineer.model", chatModel)
      .addLabeledComponent("raceengineer.customModel", customModel)
      .addComponent(enableThinking)
      .addComponentFillVertically(javax.swing.JPanel(), 0)
      .panel

    reset()
    return root!!
  }

  override fun isModified(): Boolean {
    val state = state()
    return provider.selectedItem != state.provider ||
      providerBaseUrl.text != state.providerBaseUrl ||
      autocompleteMode.selectedItem != state.autocompleteMode ||
      autocompleteModel.text != state.autocompleteModel ||
      autocompleteDebounceWait.text != state.autocompleteDebounceWait.toString() ||
      requestTimeoutSeconds.text != state.requestTimeoutSeconds.toString() ||
      chatModel.selectedItem != state.chatModel ||
      customModel.text != state.customModel ||
      enableThinking.isSelected != state.enableThinking
  }

  override fun apply() {
    val state = state()
    state.provider = provider.selectedItem as String
    state.providerBaseUrl = providerBaseUrl.text.trim().trimEnd('/')
    state.autocompleteMode = autocompleteMode.selectedItem as String
    state.autocompleteModel = autocompleteModel.text.trim()
    state.autocompleteDebounceWait = autocompleteDebounceWait.text.toIntOrNull() ?: 300
    state.requestTimeoutSeconds = (requestTimeoutSeconds.text.toIntOrNull() ?: 300).coerceIn(1, 1800)
    state.chatModel = chatModel.selectedItem as String
    state.customModel = customModel.text.trim()
    state.enableThinking = enableThinking.isSelected
  }

  override fun reset() {
    val state = state()
    provider.selectedItem = state.provider
    providerBaseUrl.text = state.providerBaseUrl
    autocompleteMode.selectedItem = state.autocompleteMode
    autocompleteModel.text = state.autocompleteModel
    autocompleteDebounceWait.text = state.autocompleteDebounceWait.toString()
    requestTimeoutSeconds.text = state.requestTimeoutSeconds.toString()
    chatModel.selectedItem = state.chatModel
    customModel.text = state.customModel
    enableThinking.isSelected = state.enableThinking
  }
}
