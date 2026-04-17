#!/usr/bin/env node

"use strict";

const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const OLLAMA_BASE_URL = process.env.OLLAMA_URL ?? "http://localhost:11434";
const REPEATS = Number.parseInt(process.env.AUTOCOMPLETE_SMOKE_REPEATS ?? "3", 10);
const MODEL = process.env.AUTOCOMPLETE_SMOKE_MODEL ?? "qwen2.5-coder:1.5b";

const CONTROL_TOKENS = [
  "<\uFF5Cfim\u2581begin\uFF5C>",
  "<\uFF5Cfim\u2581hole\uFF5C>",
  "<\uFF5Cfim\u2581end\uFF5C>",
  "<|fim_prefix|>",
  "<|fim_suffix|>",
  "<|fim_middle|>",
  "<fim_prefix>",
  "<fim_suffix>",
  "<fim_middle>",
  "<PRE>",
  "<SUF>",
  "<MID>",
  "<END>",
  "EOT",
  "<|endoftext|>",
];

const KNOWN_PLACEHOLDER_PATTERNS = [
  /^['"`]?obj\[\s*['"](?:middle_code|SUF|PRE|MID|prefix|suffix|fim_prefix|fim_suffix|fim_middle)['"]\s*\]['"`]?;?$/i,
];

const KNOWN_PLACEHOLDER_SNIPPETS = [
  "obj['middle_code']",
  "obj['SUF']",
  "obj['PRE']",
  "obj['MID']",
  "obj['prefix']",
  "obj['suffix']",
  "obj['fim_prefix']",
  "obj['fim_suffix']",
  "obj['fim_middle']",
];

const scenarios = [
  {
    id: "insertion-sort",
    description: "Fill insertion_sort function body",
    prefix: "# Insertion sort example:\ndef insertion_sort(arr):\n    ",
    suffix:
      "\n\n# Example usage:\narr = [12, 11, 13, 5, 6]\ninsertion_sort(arr)\nprint(\"Sorted array is:\", arr)",
    requiredSubstrings: ["for ", "arr"],
    forbiddenSubstrings: ["def insertion_sort", "```", "In the provided"],
  },
  {
    id: "clamp",
    description: "Fill clamp function body",
    prefix: "# Clamp example:\ndef clamp(value, min_value, max_value):\n    ",
    suffix:
      "\n\n# Example usage:\nprint(clamp(15, 0, 10))",
    requiredSubstrings: ["return"],
    forbiddenSubstrings: ["def clamp", "```", "In the provided"],
  },
  {
    id: "calc-fib-eof",
    description: "Fill calc_fib function body when suffix is empty (EOF cursor)",
    prefix: "def calc_fib(n):\n    ",
    suffix: "",
    requiredSubstrings: ["return"],
    forbiddenSubstrings: ["def calc_fib", "```", "In the provided", "obj['SUF']", "print("],
  },
  {
    id: "calc-fib-cursor-comment",
    description: "Fill calc_fib when cursor marker comment is at insertion point",
    prefix: "def calc_fib(n):\n    # Cursor here",
    suffix: "\n\n# Example usage:\nprint(calc_fib(5))",
    requiredSubstrings: ["return"],
    forbiddenSubstrings: ["def calc_fib", "```", "In the provided", "obj['SUF']", "print("],
  },
  {
    id: "calc-fib-cursor-comment-eof",
    description: "Fill calc_fib when cursor marker comment exists and suffix is empty",
    prefix: "def calc_fib(n):\n    # Cursor here",
    suffix: "",
    requiredSubstrings: ["return"],
    forbiddenSubstrings: ["def calc_fib", "```", "In the provided", "obj['SUF']", "print("],
  },
  {
    id: "sum-positive-medium",
    description: "Fill sum_positive body in medium file context",
    prefix: [
      "# Utility helpers for list processing.",
      "def filter_positive(values):",
      "    return [v for v in values if v > 0]",
      "",
      "def sum_positive(values):",
      "    ",
    ].join("\n"),
    suffix: [
      "",
      "def run_demo():",
      "    numbers = [-2, 5, 7, -1]",
      "    print(sum_positive(numbers))",
    ].join("\n"),
    requiredSubstrings: ["return"],
    forbiddenSubstrings: ["def sum_positive", "```", "In the provided"],
  },
  {
    id: "average-class-method",
    description: "Fill class method body with surrounding class/file context",
    prefix: [
      "class Metrics:",
      "    def __init__(self):",
      "        self.name = \"metrics\"",
      "",
      "    def average(self, values):",
      "        ",
    ].join("\n"),
    suffix: [
      "",
      "def demo():",
      "    m = Metrics()",
      "    print(m.average([2, 4, 6]))",
    ].join("\n"),
    requiredSubstrings: ["return"],
    forbiddenSubstrings: ["def average", "```", "In the provided"],
  },
  {
    id: "file-extension-large-context",
    description: "Fill file_extension body in larger utility file context",
    prefix: [
      "import os",
      "",
      "def join_path(left, right):",
      "    return os.path.join(left, right)",
      "",
      "def base_name(path):",
      "    return os.path.basename(path)",
      "",
      "def file_extension(path):",
      "    ",
    ].join("\n"),
    suffix: [
      "",
      "sample = \"report.csv\"",
      "print(file_extension(sample))",
    ].join("\n"),
    requiredSubstrings: ["return"],
    forbiddenSubstrings: ["def file_extension", "```", "In the provided"],
  },
  {
    id: "abs-diff-eof",
    description: "Fill abs_diff body at EOF (no suffix context)",
    prefix: "def abs_diff(a, b):\n    ",
    suffix: "",
    requiredSubstrings: ["return"],
    forbiddenSubstrings: ["def abs_diff", "```", "In the provided"],
  },
  {
    id: "normalize-spaces-medium",
    description: "Fill normalize_spaces body in medium text-utility file context",
    prefix: [
      "def trim_edges(text):",
      "    return text.strip()",
      "",
      "def normalize_spaces(text):",
      "    ",
    ].join("\n"),
    suffix: [
      "",
      "def main():",
      "    print(normalize_spaces(\"a   b   c\"))",
    ].join("\n"),
    requiredSubstrings: ["return"],
    forbiddenSubstrings: ["def normalize_spaces", "```", "In the provided"],
  },
  {
    id: "is-odd-return-expression",
    description: "Fill expression hole after return (mid-line start point)",
    prefix: "def is_odd(n):\n    return n ",
    suffix: "\n",
    requiredSubstrings: [],
    requiredAnySubstrings: ["%", "&", "not"],
    forbiddenSubstrings: ["def is_odd", "```", "In the provided"],
  },
  {
    id: "js-sum-positive-medium",
    language: "javascript",
    description: "Fill JS sumPositive function body in medium context",
    prefix: [
      "function clamp(value, min, max) {",
      "  return Math.max(min, Math.min(max, value));",
      "}",
      "",
      "function sumPositive(values) {",
      "  ",
    ].join("\n"),
    suffix: [
      "}",
      "",
      "const data = [-2, 5, 7, -1];",
      "console.log(sumPositive(data));",
    ].join("\n"),
    requiredSubstrings: ["return"],
    forbiddenSubstrings: ["function sumPositive", "```", "In the provided", "def "],
  },
  {
    id: "js-is-even-expression",
    language: "javascript",
    description: "Fill JS expression hole after return (mid-line start point)",
    prefix: [
      "function isEven(n) {",
      "  return n ",
    ].join("\n"),
    suffix: [
      ";",
      "}",
      "console.log(isEven(4));",
    ].join("\n"),
    requiredSubstrings: [],
    requiredAnySubstrings: ["%", "&"],
    forbiddenSubstrings: ["function isEven", "```", "In the provided", "def "],
  },
  {
    id: "csharp-sum-positive",
    language: "csharp",
    description: "Fill C# SumPositive method body in class context",
    prefix: [
      "using System;",
      "using System.Collections.Generic;",
      "",
      "public static class NumberUtils",
      "{",
      "    public static int SumPositive(List<int> values)",
      "    {",
      "        ",
    ].join("\n"),
    suffix: [
      "    }",
      "",
      "    public static void Main()",
      "    {",
      "        Console.WriteLine(SumPositive(new List<int>{-2, 5, 7, -1}));",
      "    }",
      "}",
    ].join("\n"),
    requiredSubstrings: ["return"],
    forbiddenSubstrings: ["SumPositive(", "```", "In the provided", "def "],
  },
  {
    id: "csharp-clamp-medium",
    language: "csharp",
    description: "Fill C# Clamp method body with nearby methods",
    prefix: [
      "using System;",
      "",
      "public static class MathHelpers",
      "{",
      "    public static int Clamp(int value, int minValue, int maxValue)",
      "    {",
      "        ",
    ].join("\n"),
    suffix: [
      "    }",
      "",
      "    public static int AbsDiff(int a, int b)",
      "    {",
      "        return Math.Abs(a - b);",
      "    }",
      "}",
    ].join("\n"),
    requiredSubstrings: ["return"],
    forbiddenSubstrings: ["Clamp(", "```", "In the provided", "def "],
  },
  {
    id: "csharp-safe-divide",
    language: "csharp",
    description: "Fill C# SafeDivide body in utility class",
    prefix: [
      "using System;",
      "",
      "public static class MathUtil",
      "{",
      "    public static int SafeDivide(int numerator, int denominator)",
      "    {",
      "        ",
    ].join("\n"),
    suffix: [
      "    }",
      "",
      "    public static void Demo()",
      "    {",
      "        Console.WriteLine(SafeDivide(10, 2));",
      "    }",
      "}",
    ].join("\n"),
    requiredSubstrings: ["return"],
    requiredAnySubstrings: ["denominator", "/", "numerator"],
    forbiddenSubstrings: ["SafeDivide(", "```", "In the provided", "def "],
  },
  {
    id: "csharp-dictionary-lookup",
    language: "csharp",
    description: "Fill C# dictionary lookup method body",
    prefix: [
      "using System.Collections.Generic;",
      "",
      "public static class PlayerStore",
      "{",
      "    public static string FindById(Dictionary<int, string> players, int id)",
      "    {",
      "        ",
    ].join("\n"),
    suffix: [
      "    }",
      "}",
    ].join("\n"),
    requiredSubstrings: ["return"],
    requiredAnySubstrings: ["TryGetValue", "ContainsKey", "players"],
    forbiddenSubstrings: ["FindById(", "```", "In the provided", "def "],
  },
  {
    id: "unity-apply-damage",
    language: "csharp",
    description: "Fill Unity ApplyDamage body in MonoBehaviour class",
    prefix: [
      "using UnityEngine;",
      "",
      "public class PlayerHealth : MonoBehaviour",
      "{",
      "    public int maxHealth = 100;",
      "    public int currentHealth = 100;",
      "",
      "    public void ApplyDamage(int damage)",
      "    {",
      "        ",
    ].join("\n"),
    suffix: [
      "    }",
      "",
      "    private void Update()",
      "    {",
      "        if (Input.GetKeyDown(KeyCode.Space))",
      "        {",
      "            ApplyDamage(10);",
      "        }",
      "    }",
      "}",
    ].join("\n"),
    requiredSubstrings: ["currentHealth"],
    requiredAnySubstrings: ["Mathf.Clamp", "damage", "if"],
    forbiddenSubstrings: ["ApplyDamage(", "```", "In the provided", "def "],
  },
  {
    id: "unity-update-move",
    language: "csharp",
    description: "Fill Unity Update movement body",
    prefix: [
      "using UnityEngine;",
      "",
      "public class SimpleMover : MonoBehaviour",
      "{",
      "    public float speed = 5f;",
      "",
      "    private void Update()",
      "    {",
      "        ",
    ].join("\n"),
    suffix: [
      "    }",
      "}",
    ].join("\n"),
    requiredSubstrings: [],
    requiredAnySubstrings: ["Input.GetAxis", "transform", "Vector3"],
    forbiddenSubstrings: ["Update(", "```", "In the provided", "def "],
  },
  {
    id: "unity-lookat-target",
    language: "csharp",
    description: "Fill Unity LateUpdate look-at-target body",
    prefix: [
      "using UnityEngine;",
      "",
      "public class LookAtTarget : MonoBehaviour",
      "{",
      "    public Transform target;",
      "",
      "    private void LateUpdate()",
      "    {",
      "        ",
    ].join("\n"),
    suffix: [
      "    }",
      "}",
    ].join("\n"),
    requiredSubstrings: [],
    requiredAnySubstrings: ["target", "transform", "LookAt", "Quaternion"],
    forbiddenSubstrings: ["LateUpdate(", "```", "In the provided", "def "],
  },
  {
    id: "unity-is-grounded",
    language: "csharp",
    description: "Fill Unity IsGrounded body with obvious physics check",
    prefix: [
      "using UnityEngine;",
      "",
      "public class GroundCheck : MonoBehaviour",
      "{",
      "    public Transform feet;",
      "    public float distance = 0.2f;",
      "    public LayerMask groundMask;",
      "",
      "    public bool IsGrounded()",
      "    {",
      "        ",
    ].join("\n"),
    suffix: [
      "    }",
      "}",
    ].join("\n"),
    requiredSubstrings: ["return"],
    requiredAnySubstrings: ["Physics.Raycast", "Physics.CheckSphere", "groundMask", "feet"],
    forbiddenSubstrings: ["IsGrounded(", "```", "In the provided", "def "],
  },
  {
    id: "cpp-sum-positive",
    language: "cpp",
    description: "Fill C++ sum_positive function body in larger file context",
    prefix: [
      "#include <vector>",
      "#include <iostream>",
      "",
      "int sum_positive(const std::vector<int>& values) {",
      "    ",
    ].join("\n"),
    suffix: [
      "}",
      "",
      "int main() {",
      "    std::cout << sum_positive({-2, 5, 7, -1}) << std::endl;",
      "    return 0;",
      "}",
    ].join("\n"),
    requiredSubstrings: ["return"],
    forbiddenSubstrings: ["sum_positive(", "```", "In the provided", "def "],
  },
  {
    id: "cpp-is-even-expression",
    language: "cpp",
    description: "Fill C++ expression hole after return (mid-line start point)",
    prefix: [
      "bool is_even(int n) {",
      "    return n ",
    ].join("\n"),
    suffix: [
      ";",
      "}",
      "",
      "int main() {",
      "    return is_even(4) ? 0 : 1;",
      "}",
    ].join("\n"),
    requiredSubstrings: [],
    requiredAnySubstrings: ["%", "&"],
    forbiddenSubstrings: ["is_even(", "```", "In the provided", "def "],
  },
];

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function generateInfill({ model, prefix, suffix, numPredict = 256, temperature = 0 }) {
  const safeSuffix = suffix.length > 0 ? suffix : "\n";

  const body = {
    model,
    prompt: prefix,
    suffix: safeSuffix,
    stream: false,
    options: {
      temperature,
      num_predict: numPredict,
    },
  };

  const response = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Ollama request failed for ${model} with status ${response.status}`);
  }

  const data = await response.json();
  if (typeof data.error === "string" && data.error.length > 0) {
    throw new Error(`Ollama model error for ${model}: ${data.error}`);
  }
  if (typeof data.response !== "string") {
    throw new Error(`Ollama response for ${model} did not include text.`);
  }

  return data.response;
}

function stripControlTokens(text) {
  return CONTROL_TOKENS.reduce((result, token) => result.split(token).join(""), text);
}

function tryExtractFirstCodeBlock(text) {
  const match = text.match(/```[^\n]*\n([\s\S]*?)```/);
  return match?.[1] ?? text;
}

function stripKnownAdditionalContextPrefix(text) {
  return text.replace(/^(?:[ \t]*(?:#|\/\/)\s*(?:Language|File uri):.*\r?\n)+/i, "");
}

function removeLeadingPrefixOverlap(text, prefix) {
  if (prefix.length === 0 || text.length === 0) {
    return text;
  }

  const maxOverlap = Math.min(prefix.length, text.length);
  for (let overlap = maxOverlap; overlap > 0; overlap -= 1) {
    const prefixTail = prefix.slice(-overlap);
    if (text.startsWith(prefixTail)) {
      return text.slice(overlap);
    }
  }

  return text;
}

function removeTrailingSuffixOverlap(text, suffix) {
  if (suffix.length === 0 || text.length === 0) {
    return text;
  }

  const fullSuffixIndex = text.indexOf(suffix);
  const withoutFullSuffix = fullSuffixIndex >= 0 ? text.slice(0, fullSuffixIndex) : text;

  const maxOverlap = Math.min(withoutFullSuffix.length, suffix.length);
  for (let overlap = maxOverlap; overlap > 0; overlap -= 1) {
    const suffixHead = suffix.slice(0, overlap);
    if (withoutFullSuffix.endsWith(suffixHead)) {
      return withoutFullSuffix.slice(0, -overlap);
    }
  }

  return withoutFullSuffix;
}

function getTrailingIndent(prefix) {
  const match = prefix.match(/(?:^|\n)([ \t]*)$/);
  return match?.[1] ?? "";
}

function truncateAtLikelyTopLevelTail(text, prefix) {
  const trailingIndent = getTrailingIndent(prefix);
  if (trailingIndent.length > 0) {
    const genericTopLevelMarker = text.match(/\n\n(?=[^\s])/);
    if (genericTopLevelMarker?.index != null) {
      return text.slice(0, genericTopLevelMarker.index);
    }
  }

  const marker = text.match(
    /\n\n(?=\s*(?:#|\/\/|def\s|class\s|function\s|if __name__|In the |(?:public|private|protected|internal)\s+))/i
  );
  if (marker?.index == null) {
    return text;
  }

  return text.slice(0, marker.index);
}

function sanitizeCompletion(response, { prefix, suffix }) {
  const withoutControlTokens = stripControlTokens(response);
  const codeLikeResponse = tryExtractFirstCodeBlock(withoutControlTokens);
  const withoutKnownContextPrefix = stripKnownAdditionalContextPrefix(codeLikeResponse);
  const withoutPrefix = removeLeadingPrefixOverlap(withoutKnownContextPrefix, prefix);
  const withoutSuffix = removeTrailingSuffixOverlap(withoutPrefix, suffix);
  const withoutTail = truncateAtLikelyTopLevelTail(withoutSuffix, prefix);
  const result = withoutTail.trim();

  if (KNOWN_PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(result))) {
    return "";
  }

  return result;
}

function normalizeContext({ prefix, suffix }) {
  const prefixLines = prefix.split("\n");
  const lastLineIndex = prefixLines.length - 1;
  const lastLine = prefixLines[lastLineIndex] ?? "";

  const prefixCursorMarkerMatch = lastLine.match(
    /^([ \t]*)(?:#|\/\/)\s*cursor here\b.*$/i
  );
  if (prefixCursorMarkerMatch != null) {
    prefixLines[lastLineIndex] = prefixCursorMarkerMatch[1] ?? "";
    prefix = prefixLines.join("\n");
  }

  suffix = suffix.replace(
    /^[ \t]*(?:#|\/\/)\s*cursor here\b[^\n]*\r?\n?/i,
    ""
  );

  return { prefix, suffix };
}

function pythonSyntaxCheck(scriptText) {
  const probes = [
    { cmd: "python", args: ["-c", "import ast,sys; ast.parse(sys.stdin.read())"] },
    { cmd: "py", args: ["-3", "-c", "import ast,sys; ast.parse(sys.stdin.read())"] },
  ];

  let lastError = "";

  for (const probe of probes) {
    const result = spawnSync(probe.cmd, probe.args, {
      input: scriptText,
      encoding: "utf8",
    });

    if (result.error && result.error.code === "ENOENT") {
      continue;
    }

    if (result.status === 0) {
      return { ok: true, command: probe.cmd };
    }

    lastError = `${probe.cmd} exited ${result.status}: ${(result.stderr || result.stdout || "").trim()}`;
  }

  return {
    ok: false,
    error: lastError || "python interpreter not found (tried python and py -3)",
  };
}

function withTempSourceFile(extension, sourceText, fn) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "raceengineer-smoke-"));
  const filePath = path.join(tempDir, `snippet.${extension}`);
  fs.writeFileSync(filePath, sourceText, "utf8");

  try {
    return fn({ filePath, tempDir });
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function runCompilerProbes({ probes, context, notFoundReason }) {
  let sawCompiler = false;
  let lastError = "";

  for (const probe of probes) {
    const args = probe.getArgs(context);
    const result = spawnSync(probe.cmd, args, { encoding: "utf8" });

    if (result.error && result.error.code === "ENOENT") {
      continue;
    }

    sawCompiler = true;
    if (result.status === 0) {
      return { ok: true, command: probe.label };
    }

    lastError = `${probe.label} exited ${result.status}: ${(result.stderr || result.stdout || "").trim()}`;
  }

  if (!sawCompiler) {
    return {
      ok: true,
      skipped: true,
      reason: notFoundReason,
    };
  }

  return {
    ok: false,
    error: lastError || "compiler returned non-zero status",
  };
}

function javascriptSyntaxCheck(scriptText) {
  return withTempSourceFile("js", scriptText, ({ filePath }) => {
    const result = spawnSync("node", ["--check", filePath], {
      encoding: "utf8",
    });

    if (result.error && result.error.code === "ENOENT") {
      return {
        ok: false,
        error: "node not found for JavaScript syntax check",
      };
    }

    if (result.status === 0) {
      return { ok: true, command: "node --check" };
    }

    return {
      ok: false,
      error: `node --check exited ${result.status}: ${(result.stderr || result.stdout || "").trim()}`,
    };
  });
}

function csharpSyntaxCheck(scriptText) {
  return withTempSourceFile("cs", scriptText, ({ filePath, tempDir }) =>
    runCompilerProbes({
      context: { filePath, tempDir },
      notFoundReason: "C# compiler not found (tried csc, mcs)",
      probes: [
        {
          cmd: "csc",
          label: "csc",
          getArgs: ({ filePath, tempDir }) => [
            "/nologo",
            "/target:library",
            `/out:${path.join(tempDir, "snippet.dll")}`,
            filePath,
          ],
        },
        {
          cmd: "mcs",
          label: "mcs",
          getArgs: ({ filePath, tempDir }) => [
            "-nologo",
            "-target:library",
            `-out:${path.join(tempDir, "snippet.dll")}`,
            filePath,
          ],
        },
      ],
    })
  );
}

function cppSyntaxCheck(scriptText) {
  return withTempSourceFile("cpp", scriptText, ({ filePath, tempDir }) =>
    runCompilerProbes({
      context: { filePath, tempDir },
      notFoundReason: "C++ compiler not found (tried g++, clang++, cl)",
      probes: [
        {
          cmd: "g++",
          label: "g++ -fsyntax-only",
          getArgs: ({ filePath }) => ["-std=c++17", "-fsyntax-only", filePath],
        },
        {
          cmd: "clang++",
          label: "clang++ -fsyntax-only",
          getArgs: ({ filePath }) => ["-std=c++17", "-fsyntax-only", filePath],
        },
        {
          cmd: "cl",
          label: "cl /c",
          getArgs: ({ filePath, tempDir }) => [
            "/nologo",
            "/EHsc",
            "/c",
            filePath,
            `/Fo:${path.join(tempDir, "snippet.obj")}`,
          ],
        },
      ],
    })
  );
}

function syntaxCheck({ language, sourceText }) {
  const normalized = (language ?? "python").toLowerCase();
  if (normalized === "python") {
    return pythonSyntaxCheck(sourceText);
  }
  if (normalized === "javascript" || normalized === "js") {
    return javascriptSyntaxCheck(sourceText);
  }
  if (normalized === "csharp" || normalized === "c#") {
    return csharpSyntaxCheck(sourceText);
  }
  if (normalized === "cpp" || normalized === "c++") {
    return cppSyntaxCheck(sourceText);
  }

  return {
    ok: false,
    error: `Unsupported scenario language '${language}'`,
  };
}

function validateCompletion(completion, scenario) {
  assert(completion.length > 0, `${scenario.id}: completion is empty after sanitize`);
  assert(
    CONTROL_TOKENS.every((token) => !completion.includes(token)),
    `${scenario.id}: completion still contains control token`
  );
  assert(
    !KNOWN_PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(completion)),
    `${scenario.id}: completion is placeholder text`
  );
  assert(
    KNOWN_PLACEHOLDER_SNIPPETS.every((snippet) => !completion.includes(snippet)),
    `${scenario.id}: completion still contains placeholder snippet`
  );

  for (const required of scenario.requiredSubstrings) {
    assert(
      completion.includes(required),
      `${scenario.id}: missing required substring '${required}'`
    );
  }

  if (Array.isArray(scenario.requiredAnySubstrings) && scenario.requiredAnySubstrings.length > 0) {
    const hasAnyRequired = scenario.requiredAnySubstrings.some((required) =>
      completion.includes(required)
    );
    assert(
      hasAnyRequired,
      `${scenario.id}: missing any required substring from [${scenario.requiredAnySubstrings.join(", ")}]`
    );
  }

  for (const forbidden of scenario.forbiddenSubstrings) {
    assert(
      !completion.includes(forbidden),
      `${scenario.id}: contains forbidden substring '${forbidden}'`
    );
  }
}

async function runScenario(scenario) {
  console.log(`\n[smoke] Scenario: ${scenario.id} - ${scenario.description}`);

  for (let attempt = 1; attempt <= REPEATS; attempt += 1) {
    const context = normalizeContext({
      prefix: scenario.prefix,
      suffix: scenario.suffix,
    });

    const raw = await generateInfill({
      model: MODEL,
      prefix: context.prefix,
      suffix: context.suffix,
      numPredict: 256,
      temperature: 0,
    });

    const completion = sanitizeCompletion(raw, {
      prefix: context.prefix,
      suffix: context.suffix,
    });

    console.log(`\n[smoke] ${scenario.id} attempt ${attempt}/${REPEATS} completion:`);
    console.log("-----");
    console.log(completion);
    console.log("-----");

    validateCompletion(completion, scenario);

    const fullScript = `${context.prefix}${completion}${context.suffix}`;
    const syntax = syntaxCheck({
      language: scenario.language ?? "python",
      sourceText: fullScript,
    });
    assert(syntax.ok, `${scenario.id}: syntax check failed: ${syntax.error}`);

    if (syntax.skipped) {
      console.log(
        `[smoke] ${scenario.id} attempt ${attempt}/${REPEATS} passed (syntax check skipped: ${syntax.reason})`
      );
    } else {
      console.log(
        `[smoke] ${scenario.id} attempt ${attempt}/${REPEATS} passed (syntax via ${syntax.command})`
      );
    }
  }
}

async function run() {
  console.log(`[smoke] Using Ollama at ${OLLAMA_BASE_URL}`);
  console.log(`[smoke] Model: ${MODEL}`);
  console.log(`[smoke] Repeats per scenario: ${REPEATS}`);

  assert(REPEATS >= 2, "REPEATS must be at least 2");

  for (const scenario of scenarios) {
    await runScenario(scenario);
  }

  console.log("\n[smoke] all autocomplete scenarios passed");
}

run().catch((error) => {
  console.error(`[smoke] failed: ${error.message}`);
  process.exitCode = 1;
});
