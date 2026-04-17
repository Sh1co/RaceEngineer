# RaceEngineer Project Summary (Detailed Internal Notes)

## What this project is
- RaceEngineer is a VS Code extension that provides:
- Local-LLM chat workflows (template-driven task chats).
- Inline code completion (Copilot-style suggestions).
- Optional diff-apply editing flow from model output.
- Optional repository indexing + embedding-based retrieval augmentation.

## Monorepo layout
- `app/vscode`: packaging + extension manifest/assets/walkthrough docs.
- `lib/extension`: VS Code extension runtime (activation, commands, AI calls, state).
- `lib/webview`: React webview UI for chat and diff panels.
- `lib/common`: shared protocol/schema types between extension and webview.
- `template`: built-in `.rdt.md` conversation templates (chat/tasks/fun/experimental).
- `doc`: architecture and template docs.

## Build and packaging model
- Nx workspace with targets per package.
- `lib/extension`:
- `compile`: TypeScript compile (`tsc`).
- `build`: bundle compiled JS into `dist/extension.js` via esbuild, externalizing `vscode`.
- `lib/webview`:
- `compile`: TypeScript compile.
- `build`: browser bundle to `dist/webview.js` via esbuild.
- `app/vscode`:
- `build`: noop (depends on libs).
- `package`: shell script builds VSIX bundle.
- publish targets for VS Code Marketplace / OpenVSX.

## Extension startup and wiring
- Entry: `lib/extension/src/extension.ts`.
- On activate:
- Creates API key manager (secret storage backed).
- Creates output channels and logger.
- Loads conversation templates (built-in + extension + workspace).
- Creates `AIClient`, `ChatModel`, `ChatPanel`, `ChatController`, `DiffEditorManager`.
- Registers:
- Webview view provider (`raceengineer.chat`).
- Command palette/context commands (`startChat`, `explainCode`, `findBugs`, etc.).
- Template reload command.
- Repository indexing command.
- Inline completion provider for all files (`**`).

## Main runtime architecture

### 1) Extension state layer
- `ChatModel` holds in-memory list of conversation objects + selected conversation id.
- No persistence across reloads in current implementation.

### 2) Controller layer
- `ChatController` receives webview outgoing messages and command calls.
- It maps actions to conversation methods (`answer`, `retry`, `dismissError`, export, delete).
- New conversation creation path:
- Resolve conversation type by id.
- Resolve "conversation-start" variables (selected text, location, etc.).
- Instantiate `Conversation`.
- Add/select conversation in model.
- Refresh webview state.
- Optionally auto-run initial message prompt.

### 3) Conversation execution layer
- `Conversation` is core orchestration object:
- Holds message history, state (`waiting`, `streaming`, `userCanReply`), error, template, init vars.
- Builds prompt via Handlebars from template snippets.
- Resolves variables at message time.
- Executes optional retrieval augmentation before chat call.
- Streams text from AI client chunk-by-chunk.
- Routes chunks through completion handler type:
- `message`: stream bot message in chat.
- `update-temporary-editor`: live-update temp doc/editor.
- `active-editor-diff`: build and update diff panel.
- Final completion then commits final bot message / diff state.

### 4) UI layer (webview)
- Webview entry: `lib/webview/src/webview.tsx`.
- Renders `ChatPanelView` for `chat` panel state or `DiffPanelView` for diff state.
- Message protocol exchanged through `postMessage` with zod-validated payloads in `lib/common`.
- Chat view:
- Collapsed/expanded conversation cards.
- Markdown rendering of bot answers.
- Input area state machine driven by extension state.
- Footer actions: export/delete.
- Diff view:
- Displays old vs new code.
- Sends `applyDiff` event back to extension.

### 5) Diff apply flow
- Triggered by template completion handler `active-editor-diff`.
- Conversation computes edited content by replacing selected range.
- Attempts indentation normalization by relative indent between selection and model output.
- Opens dedicated diff webview panel (`raceengineer.diff.<conversationId>`).
- On apply:
- Creates `WorkspaceEdit` replacing selected range in source doc.
- Closes diff tab group tab if found.

## Template system (high leverage subsystem)
- Templates are markdown `.rdt.md` with:
- JSON config code block (`json conversation-template`).
- Prompt code blocks (`template-initial-message`, `template-response`).
- Parser (`parseRubberduckTemplate.ts`) extracts named code blocks via `marked`.
- JSON parsed with `secure-json-parse` + validated by zod schema.
- Prompt templates resolved via Handlebars at runtime.
- Supports:
- Variables (`selected-text`, `message`, `context`, `filename`, etc.).
- Constraints (`text-length`).
- Optional initial message prompt.
- Completion handlers.
- Optional retrieval augmentation config.
- Template loading order:
- Built-ins from `template/`.
- Extension-injected templates (API from `activate` return object).
- Workspace templates (user custom templates).

## Input variable resolution
- Resolver functions in `conversation/input/*`.
- Important variable sources:
- Selected text and location from active editor selection.
- Diagnostics-enriched selected text (`selected-text-with-diagnostics`).
- Open files list for context.
- Past message content by index.
- Validation checks constraints before conversation starts.

## AI provider abstraction
- `AIClient` uses `modelfusion`.
- Provider chosen by `raceengineer.provider` (`Ollama`, `llamafile`, `llama.cpp`, code includes `OpenAI` path though manifest enum omits it).
- Chat and autocomplete can use different models:
- Chat model from `raceengineer.model` (+ `raceengineer.customModel`).
- Completion model from `raceengineer.autocomplete.model`.
- Streaming chat uses instruction prompt style.
- Autocomplete uses text generation model + fill-in-middle prompt templates.
- Embedding generation currently uses `openai.TextEmbedder` API shape with model `text-embedding-ada-002`, but uses provider API config from current provider path.

## Inline completion pipeline
- Provider: `AutoCompleteProvider`.
- Behavior:
- Honors mode (`automatic`/`manual`/`disabled`) and editor inline suggest setting.
- Debounced request (default 300ms; configurable).
- Builds prefix/suffix context around cursor (~300 lines each side).
- Adds language + file URI comment context.
- Prompt style selected by model family (`deepseek`, `stable-code`, fallback CodeLlama FIM).
- Calls `ai.generateText()` and returns one inline completion item.

## Retrieval augmentation subsystem
- Command `raceengineer.indexRepository`:
- Gets tracked files via `git ls-files`.
- Filters to supported extensions.
- Reads files, chunks by line length budget, generates embedding per chunk.
- Stores embedding corpus at `.raceengineer/embedding/repository.json`.
- During conversation prompt build:
- Template can define `retrievalAugmentation` source file/query/threshold/maxResults.
- System embeds query, cosine-matches stored chunks, injects top matches into template variable.

## Extension manifest and UX integration
- Manifest in `app/vscode/asset/package.json` defines:
- Activation on startup finished.
- Commands, menus, context submenu, keybindings, settings schema.
- Sidebar container + chat webview.
- Walkthrough/onboarding pages.
- Config includes provider/base URL, chat model, autocomplete options, syntax highlighting mode.

## Shared protocol and validation
- `lib/common/src/webview-api/*` contains zod schemas for:
- Panel state (`chat` or `diff`).
- Incoming/outgoing messages.
- Conversation/error/message structures.
- Extension and webview both consume shared types to reduce drift.

## Current quality and test posture
- Test scripts exist (Vitest in extension package), but repository currently appears to have little/no test files.
- Runtime behavior mostly validated by manual extension usage.

## Notable implementation details and rough edges
- `ChatPanel.update()` currently hardcodes `hasOpenAIApiKey = false`, which can desync UI from stored key state.
- `AIClient.getProvider()` accepts `"OpenAI"` in code, but manifest provider enum exposes only local providers.
- Some comments mark potential Windows path bugs in indexing (string path joins with `/`).
- `ChatPanelView` uses `panelState.conversations.reverse()` in render, mutating original array reference (can produce ordering side effects).
- `AutoCompleteProvider.provideInlineCompletionItems()` may return `null` path inside Promise without resolving in skip branch.
- Diff completion handler schema in template type does not include `botMessage`, but one template includes it under `active-editor-diff`; code ignores it in that path.
- No conversation persistence; reload clears history.

## Mental model summary
- System is "template-first orchestration":
- Prompt behavior mostly not hardcoded in logic; defined via `.rdt.md` templates + variable resolvers.
- Extension hosts state and side effects (editor reads/writes, model calls, diff apply).
- Webview is mostly render+event shell over extension-managed state.
- This makes adding new conversation types cheap (new template file) while keeping runtime core relatively small.
