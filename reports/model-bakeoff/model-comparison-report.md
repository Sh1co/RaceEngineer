# Qwen Autocomplete Model Bakeoff

Date: 2026-04-17  
Environment: Ollama local, strict model isolation (`ollama stop` between runs), smoke repeats = 3.

## Models Tested

1. `qwen2.5-coder:1.5b`
2. `qwen2.5-coder:1.5b-base`
3. `qwen2.5-coder:3b`
4. `qwen2.5-coder:3b-base`

## Test Suite Used

- `node lib/extension/scripts/live-autocomplete-smoke.js`
- Includes Python, JS, C#, Unity(C#), C++ scenarios.
- C# and C++ compiler checks were skipped on this machine (no `csc`/`mcs` and no `g++`/`clang++`/`cl` in PATH), but output-content assertions still ran.

## Timing + Pass Status

| Model | Full Suite Status | Time (s) | Notes |
|---|---|---:|---|
| `qwen2.5-coder:1.5b` | Pass | 43.17 | Stable across scenarios |
| `qwen2.5-coder:1.5b-base` | Fail | 8.53 | Failed at `calc-fib-eof` (leaked `print(...)`) |
| `qwen2.5-coder:3b` | Pass | 62.90 | Slowest, highest-quality Unity completion style |
| `qwen2.5-coder:3b-base` | Pass | 43.40 | Fast, but noisier Unity/C# style |

`1.5b-base` failure was reproduced in isolated rerun.

## Manual Output Review (Unity/C# Focus)

Manual probe file: `reports/model-bakeoff/manual-probe.json`

### `qwen2.5-coder:1.5b`
- Unity `ApplyDamage`: inserts `Die()` and starts extra method block (`private void Die()`), so body-boundary leakage risk.
- Unity movement: concise and usable.
- Dictionary lookup: safer (`ContainsKey` guard) than direct index.

### `qwen2.5-coder:1.5b-base`
- Repeated hard failure in suite: appends `print(calc_fib(5))` in EOF fib scenario.
- Unity `ApplyDamage`: `Die()` + unfinished extra method stub.
- Dictionary lookup: direct index (`players[id]`) without existence guard.
- Overall weakest reliability.

### `qwen2.5-coder:3b`
- Passed suite.
- Unity `ApplyDamage`: good containment (no leaked extra method), sets/debounces health and logs death.
- Still sometimes uses direct dictionary index, but overall output quality most coherent.
- Slowest runtime.

### `qwen2.5-coder:3b-base`
- Passed suite and fast.
- Unity `ApplyDamage`: adds debug log and leaks extra `Die()` helper method block in manual probe.
- Dictionary lookup: direct index without guard.
- Better than `1.5b-base`, but still noisy around helper-method leakage.

## Pros / Cons by Model

### `qwen2.5-coder:1.5b`
Pros:
- Fast.
- Passed full automated suite.
- Good deterministic short completions.

Cons:
- Unity method-body tasks may emit undefined helper calls (`Die()`).
- Occasional trailing brace/member leakage in C# style outputs.

### `qwen2.5-coder:1.5b-base`
Pros:
- Fast startup for simple snippets.

Cons:
- Failed core suite reproducibly.
- Leaks extraneous top-level code in EOF case.
- Lowest reliability for guarded autocomplete.

### `qwen2.5-coder:3b`
Pros:
- Highest quality/coherence in manual Unity checks.
- Passed full suite.
- Better tendency to keep completion semantically self-contained.

Cons:
- Significantly slower.
- Still not perfect for safe dictionary access defaults.

### `qwen2.5-coder:3b-base`
Pros:
- Near-`1.5b` speed.
- Passed full suite.

Cons:
- More noisy than `3b` (extra helper blocks/logging).
- Still emits potentially undefined helper calls in Unity contexts.

## Recommendation

Primary recommendation: `qwen2.5-coder:3b` for best output quality if latency budget allows.

Latency-optimized recommendation: `qwen2.5-coder:1.5b` as practical fast default with stricter C#/Unity post-guards enabled.

Do not recommend: `qwen2.5-coder:1.5b-base` for production autocomplete in current pipeline due reproducible suite failure.

Conditional option: `qwen2.5-coder:3b-base` when speed is priority and you accept moderate noise; pair with strict sanitization/rejection guards.
