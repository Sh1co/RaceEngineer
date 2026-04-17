package com.raceengineer.jetbrains.completion

import com.intellij.codeInsight.AutoPopupController
import com.intellij.codeInsight.completion.CompletionType
import com.intellij.codeInsight.editorActions.TypedHandlerDelegate
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.project.Project
import com.intellij.psi.PsiFile
import com.raceengineer.jetbrains.settings.RaceEngineerSettingsState

class RaceEngineerTypedHandler : TypedHandlerDelegate() {
  override fun checkAutoPopup(
    charTyped: Char,
    project: Project,
    editor: Editor,
    file: PsiFile
  ): Result {
    val settings = RaceEngineerSettingsState.getInstance()
    if (settings.autocompleteMode != "automatic") {
      return Result.CONTINUE
    }
    if (settings.provider != "Ollama") {
      return Result.CONTINUE
    }

    val shouldTrigger = charTyped.isLetterOrDigit() || charTyped == '_' || charTyped == '.' || charTyped == ':'
    if (!shouldTrigger) {
      return Result.CONTINUE
    }

    AutoPopupController.getInstance(project).scheduleAutoPopup(
      editor,
      CompletionType.BASIC,
      null
    )
    return Result.CONTINUE
  }
}
