# RaceEngineer JetBrains Plugin (Rider-first)

This module contains the first Rider/JetBrains implementation of RaceEngineer.

## Current v1 feature set

- Chat tool window with in-memory conversation tabs.
- Action menu parity for:
  - Start Chat
  - Explain Code
  - Find Bugs
  - Generate Code
  - Generate Unit Test
  - Diagnose Errors
  - Reload Templates
  - Show Logs
- Ollama chat requests (`/api/chat`) with `raceengineer.*` settings parity.
- Autocomplete provider with:
  - qwen true infill (`prompt` + `suffix`) on Ollama.
  - deepseek/stable/default prompt strategies.
  - context normalization and response sanitization guards.
- Kotlin regression tests for strategy/sanitize/normalize and infill payload fallback logic.

## Build and test

Prerequisites:
- Java 17+
- Gradle

Commands:
- `gradle -p app/jetbrains test`
- `gradle -p app/jetbrains buildPlugin`
- `gradle -p app/jetbrains runIde`

Produced artifact:
- `app/jetbrains/build/distributions/*.zip`

## Scope notes

This module is intentionally "core parity first". Deferred features are tracked in:
- `doc/jetbrains-not-transferred-yet.md`
