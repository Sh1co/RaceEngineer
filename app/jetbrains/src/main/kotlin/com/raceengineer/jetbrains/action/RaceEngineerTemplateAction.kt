package com.raceengineer.jetbrains.action

import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.wm.ToolWindowManager
import com.raceengineer.jetbrains.service.RaceEngineerService

abstract class RaceEngineerTemplateAction(private val templateId: String) : AnAction() {
  override fun actionPerformed(e: AnActionEvent) {
    val project = e.project ?: return
    val service = RaceEngineerService.getInstance(project)
    service.createConversation(templateId)
    ToolWindowManager.getInstance(project).getToolWindow("RaceEngineer")?.show()
  }
}
