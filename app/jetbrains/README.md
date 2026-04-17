# RaceEngineer JetBrains Plugin (Archived WIP)

This module contains the first Rider/JetBrains implementation of RaceEngineer.
Current status: archived for now. It does not work reliably yet (including Rider 2024.2), so treat this module as parked work-in-progress.

## Archived scope snapshot

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
- Chat timeout control (`requestTimeoutSeconds`) with one automatic retry on transient timeout.
- Workspace file mention resolver for prompts like `FooService.cs` or `src/foo/FooService.cs`.
- Autocomplete provider with:
  - qwen true infill (`prompt` + `suffix`) on Ollama.
  - deepseek/stable/default prompt strategies.
  - context normalization and response sanitization guards.
  - Rider typing heuristics (`letter/digit`, `.`, `_`, `:`, `>`, newline) + prefix-filter bypass for popup visibility.
- Kotlin regression tests for strategy/sanitize/normalize, completion engine flow, timeout/retry behavior, and workspace file context resolution.

## Build and test (only if explicitly resuming this work)

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
