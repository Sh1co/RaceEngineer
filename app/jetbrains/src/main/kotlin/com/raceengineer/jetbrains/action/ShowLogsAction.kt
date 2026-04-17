package com.raceengineer.jetbrains.action

import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.ui.Messages
import com.raceengineer.jetbrains.service.RaceEngineerService

class ShowLogsAction : AnAction() {
  override fun actionPerformed(e: AnActionEvent) {
    val project = e.project ?: return
    val logs = RaceEngineerService.getInstance(project).allLogs()
    val body = if (logs.isEmpty()) "No logs yet." else logs.joinToString("\n")
    Messages.showInfoMessage(project, body, "RaceEngineer Logs")
  }
}
