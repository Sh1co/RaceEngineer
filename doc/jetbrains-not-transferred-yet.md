# JetBrains Port: Not Transferred Yet

This file tracks gaps intentionally deferred after v1 Rider/JetBrains implementation.

## Deferred runtime features

- True inline ghost-text completion provider (current implementation uses completion contributor list insertion path).
- Repository indexing command (`raceengineer.indexRepository`) and embedding corpus build.
- Retrieval augmentation execution from `.raceengineer/embedding/*`.
- Active-editor diff workflow with side-by-side preview and one-click apply.
- Chat-driven file rewrite apply flow (`<file_edit path=...>` parsing and workspace writes).
- Workspace custom template parser parity (`.raceengineer/template/*.rdt.md` full parser and constraints).
- Webview React panel parity (current UI is native Swing tool window for stability).

## Deferred provider support

- `llama.cpp` provider transport.
- `llamafile` provider transport.
- OpenAI provider path.

## Deferred release engineering

- Marketplace publication metadata and compliance checklist.
- Signed release pipeline for JetBrains Marketplace submission.
- Multi-IDE matrix validation artifacts (Rider + IntelliJ + PyCharm + WebStorm).

## Deferred testing

- IDE integration tests that execute chat + completion in test fixture projects.
- Repeated live smoke runner for JetBrains (equivalent of `live-autocomplete-smoke.js`).
