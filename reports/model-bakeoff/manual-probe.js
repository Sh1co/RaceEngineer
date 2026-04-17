#!/usr/bin/env node
"use strict";

const OLLAMA_BASE_URL = process.env.OLLAMA_URL ?? "http://localhost:11434";

const models = [
  "qwen2.5-coder:1.5b",
  "qwen2.5-coder:1.5b-base",
  "qwen2.5-coder:3b",
  "qwen2.5-coder:3b-base",
];

const scenarios = [
  {
    id: "unity-apply-damage",
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
  },
  {
    id: "unity-update-move",
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
  },
  {
    id: "csharp-dictionary-lookup",
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
  },
];

async function generateInfill({ model, prefix, suffix }) {
  const safeSuffix = suffix.length > 0 ? suffix : "\n";
  const response = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      prompt: prefix,
      suffix: safeSuffix,
      stream: false,
      options: {
        temperature: 0,
        num_predict: 256,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const data = await response.json();
  if (typeof data.error === "string" && data.error.length > 0) {
    throw new Error(data.error);
  }

  if (typeof data.response !== "string") {
    throw new Error("Missing response text");
  }

  return data.response.trim();
}

async function run() {
  const result = {
    baseUrl: OLLAMA_BASE_URL,
    createdAt: new Date().toISOString(),
    data: {},
  };

  for (const model of models) {
    result.data[model] = {};
    for (const scenario of scenarios) {
      const response = await generateInfill({
        model,
        prefix: scenario.prefix,
        suffix: scenario.suffix,
      });
      result.data[model][scenario.id] = response;
    }
  }

  console.log(JSON.stringify(result, null, 2));
}

run().catch((error) => {
  console.error(`manual-probe failed: ${error.message}`);
  process.exitCode = 1;
});
