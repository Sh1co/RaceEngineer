<div align="center">
  <h1><b>RaceEngineer</b></h1>
  <p>
    <strong>A modern fork of Privy the open-source alternative to GitHub copilot that runs locally.</strong>
  </p>
  <img src="./app/vscode/asset/media/extension-icon.png" width="128" alt="RaceEngineer icon"/>
  <br/>
  <img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"/>
  <img src="https://img.shields.io/github/v/release/Sh1co/RaceEngineer" alt="GitHub: Releases"/>
  <img src="https://img.shields.io/github/issues/Sh1co/RaceEngineer" alt="GitHub Issues"/>
  <img src="https://img.shields.io/github/stars/Sh1co/RaceEngineer" alt="GitHub Stars"/>
</div>

## Why this fork exists

Original project stopped updating long ago and drifted behind current local models.
RaceEngineer keeps same spirit, but tuned for modern Ollama model workflows and better reliability.

## See it in action

### Real-time code completion

<img src="./app/vscode/asset/media/autocompletion.gif" width="760" alt="RaceEngineer autocomplete demo"/>

### Chat with your code

<img src="./app/vscode/asset/media/chat.gif" width="760" alt="RaceEngineer chat demo"/>

## Prerequisites

Run local LLM backend first:

- [Ollama](https://github.com/ollama/ollama) (recommended)
- [llamafile](https://github.com/Mozilla-Ocho/llamafile) (experimental)
- [llama.cpp](https://github.com/ggerganov/llama.cpp) (experimental)

## Recommended model setup

Use separate models for completion/chat/embedding:

- Completion: `qwen2.5-coder:1.5b` or DeepSeek coder variants
- Chat: `qwen3.5:9b` (or your preferred instruct model)
- Embedding: `nomic-embed-text`

## Install

### VS Code extension

- Not available on VS Code Marketplace yet.
- Need to build and install locally.

### JetBrains plugin (archived WIP)

- Status: archived for now, not working reliably yet (including Rider 2024.2).
- Module remains in repo at `app/jetbrains` for future continuation.
- Do not use for production/editor workflow at this time.

## Configuration

Set these VS Code settings:

- `raceengineer.provider` (default `Ollama`)
- `raceengineer.providerBaseUrl` (default `http://localhost:11434`)
- `raceengineer.autocomplete.mode`
- `raceengineer.autocomplete.model`
- `raceengineer.autocomplete.debounceWait`
- `raceengineer.model`
- `raceengineer.customModel`
- `raceengineer.chat.enableThinking`
- `raceengineer.embedding.model`

## Key features

- Local-first completion + chat
- Threaded coding conversations
- Explain code, find bugs, generate tests, diagnose errors
- Retrieval augmentation with repository indexing
- Modernized model support path for active local models

## JetBrains status

JetBrains plugin is archived WIP and currently not functional enough for use.

Deferred parity items are tracked in:
- [`doc/jetbrains-not-transferred-yet.md`](./doc/jetbrains-not-transferred-yet.md)

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md).
