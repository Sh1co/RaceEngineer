package com.raceengineer.jetbrains.action

import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.ActionManager
import com.intellij.openapi.actionSystem.IdeActions

class TriggerCompletionAction : AnAction() {
  override fun actionPerformed(e: AnActionEvent) {
    val action = ActionManager.getInstance().getAction(IdeActions.ACTION_CODE_COMPLETION) ?: return
    action.actionPerformed(e)
  }
}
