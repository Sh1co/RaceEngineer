# Privy Inline Autocomplete Deep Dive (Internal)

## Goal
Understand exactly how Privy produces inline suggestions in VS Code, and why behavior is model-dependent.

## End-to-end request flow

1. VS Code trigger
- Privy registers an inline completion provider in `activate()`:
- File: `lib/extension/src/extension.ts`
- API: `vscode.languages.registerInlineCompletionItemProvider({ pattern: "**" }, new AutoCompleteProvider(...))`
- Result: provider can run for any text document.

2. Provider receives request
- File: `lib/extension/src/autocomplete/AutoCompleteProvider.ts`
- Entry: `provideInlineCompletionItems(document, position, context, token)`
- VS Code calls this on automatic triggers or manual trigger command.

3. Debounce and skip checks
- Debounce timer defaults to `300ms` (`privy.autocomplete.debounceWait`).
- Skip conditions:
- Autocomplete mode is `disabled`.
- Mode is `manual` but trigger is automatic.
- Active editor has selection during automatic trigger.
- Cancellation token already canceled.
- Note: skip branch returns `null` inside timeout callback, but Promise may not resolve in that branch (implementation quirk).

4. Build model input context
- Provider gathers:
- `prefix`: text before cursor (up to ~300 lines back).
- `suffix`: text after cursor (up to ~300 lines forward).
- `additionalContext`: language + file URI hint, wrapped as comments when comment syntax available.
- Language metadata source: `lib/extension/src/autocomplete/languages.ts`.

5. Build model-specific prompt format
- File: `lib/extension/src/autocomplete/AutoCompleteTemplateProvider.ts`
- Chooses fill-in-middle (FIM) format based on model name:
- DeepSeek-style:
  - Prompt markers: `<｜fim▁begin｜> ... <｜fim▁hole｜> ... <｜fim▁end｜>`
  - Stop tokens include these markers and `<END>`.
- Stable Code-style:
  - Prompt markers: `<fim_prefix> ... <fim_suffix> ... <fim_middle>`
  - Stop token: `<|endoftext|>`.
- Default (CodeLlama-style):
  - Prompt markers: `<PRE> ... <SUF> ... <MID>`
  - Stop tokens include `<PRE>`, `<SUF>`, `<MID>`, `<END>`, `EOT`.

6. Select model + provider backend
- File: `lib/extension/src/ai/AIClient.ts`
- Autocomplete model source:
- `privy.autocomplete.model` (e.g. `deepseek-coder:1.3b-base`).
- Provider source:
- `privy.provider` (`Ollama`, `llamafile`, `llama.cpp`; code also supports `OpenAI` string path).
- Calls `generateText()` with text-prompt model path (`withTextPrompt()`), not chat-instruction path.

7. Generate text and return suggestion
- Provider sends prompt + stop sequences to AI client.
- AI client calls `modelfusion.generateText`.
- Returned text becomes one inline completion item:
- `insertText: response`
- `range: new Range(position, position)`
- VS Code shows ghost text inline.

## Config knobs that affect behavior

- `privy.autocomplete.mode`
- `automatic`: fire as user types.
- `manual`: user must trigger `editor.action.inlineSuggest.trigger` (keybinding configured in extension manifest).
- `disabled`: never run provider.

- `privy.autocomplete.model`
- Determines prompt format branch and model used for generation.

- `privy.autocomplete.debounceWait`
- Controls latency/throughput tradeoff and frequency of calls.

- `editor.inlineSuggest.enabled`
- If false, Privy completion effectively disabled.

- `privy.provider` + `privy.providerBaseUrl`
- Control backend transport and model-serving runtime.

## Why autocomplete is model-dependent

Inline autocomplete here is model-dependent at multiple layers, not just quality:

1. Prompt token protocol dependency (hard dependency)
- Different code models are trained to understand different FIM sentinel tokens.
- If wrong sentinels used, model can ignore split point or generate garbage.
- Privy explicitly branches prompt format by model prefix to match expected tokens.

2. Stop-token dependency (hard dependency)
- Model outputs can include control markers or continue across boundaries unless stopped correctly.
- Stop sequences differ by model family because token conventions differ.

3. Prompting mode dependency (hard dependency)
- Autocomplete uses text-completion style (`withTextPrompt`), not chat instruction.
- Some models behave much better in pure completion mode for inline code insertion.

4. Model training objective dependency (quality dependency)
- Code-specialized models trained on FIM/code tasks predict local continuations better.
- Instruction/chat-oriented models may over-explain or produce conversational text.

5. Tokenizer and context behavior dependency (quality + stability dependency)
- Prefix/suffix handling, truncation sensitivity, and sentinel recognition vary by tokenizer/model.
- Same raw prompt can produce different completion length/style across models.

6. Latency and throughput dependency (UX dependency)
- Inline suggestions are latency-sensitive.
- Smaller local code models can feel responsive; larger models can feel laggy even if more capable.

## Concrete code links

- Registration:
  - `lib/extension/src/extension.ts`
- Provider orchestration:
  - `lib/extension/src/autocomplete/AutoCompleteProvider.ts`
- Model-specific prompt building:
  - `lib/extension/src/autocomplete/AutoCompleteTemplateProvider.ts`
- AI backend/model selection:
  - `lib/extension/src/ai/AIClient.ts`
- Settings and manual keybindings:
  - `app/vscode/asset/package.json`
- Language metadata for context comments:
  - `lib/extension/src/autocomplete/languages.ts`

## Practical implications for changes

If adding a new autocomplete model family:

1. Add prompt branch in `AutoCompleteTemplateProvider` for that model's expected FIM syntax.
2. Add/adjust stop tokens for that model.
3. Validate output does not include control sentinels.
4. Test both `automatic` and `manual` trigger modes.
5. Benchmark latency with realistic debounce setting.

If quality poor:

1. Verify model name actually matches branch (prefix check).
2. Ensure sentinels align with model documentation.
3. Tune stop sequences and max token behavior.
4. Use code-specialized model for autocomplete, separate from chat model.

