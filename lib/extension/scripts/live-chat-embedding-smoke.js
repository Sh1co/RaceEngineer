#!/usr/bin/env node

"use strict";

const OLLAMA_BASE_URL = process.env.OLLAMA_URL ?? "http://localhost:11434";
const CHAT_MODEL = process.env.CHAT_SMOKE_MODEL ?? "qwen3.5:9b";
const EMBED_MODEL = process.env.EMBED_SMOKE_MODEL ?? "nomic-embed-text";
const REPEATS = Number.parseInt(process.env.CHAT_EMBED_SMOKE_REPEATS ?? "3", 10);

const REASONING_LEAK_PATTERNS = [
  /<think>/i,
  /<\/think>/i,
  /thinking process/i,
  /reasoning:/i,
];

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function cosineSimilarity(a, b) {
  assert(a.length === b.length, "cosineSimilarity requires equal vector lengths");
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

async function chatOnce({ prompt, stop }) {
  const response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: CHAT_MODEL,
      stream: true,
      think: false,
      messages: [
        {
          role: "system",
          content: "You are concise coding assistant. Follow user format exactly.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      options: {
        temperature: 0,
        num_predict: 256,
        ...(Array.isArray(stop) && stop.length > 0 ? { stop } : {}),
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Chat request failed with status ${response.status}`);
  }

  if (response.body == null) {
    throw new Error("Chat response body missing");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  let finalChunk = undefined;

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    let newlineIndex = buffer.indexOf("\n");
    while (newlineIndex >= 0) {
      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);

      if (line.length > 0) {
        const parsed = JSON.parse(line);
        if (typeof parsed.error === "string" && parsed.error.length > 0) {
          throw new Error(parsed.error);
        }
        if (typeof parsed?.message?.content === "string") {
          text += parsed.message.content;
        }
        if (parsed.done === true) {
          finalChunk = parsed;
        }
      }

      newlineIndex = buffer.indexOf("\n");
    }
  }

  buffer += decoder.decode();
  const tail = buffer.trim();
  if (tail.length > 0) {
    const parsed = JSON.parse(tail);
    if (typeof parsed?.message?.content === "string") {
      text += parsed.message.content;
    }
    if (parsed.done === true) {
      finalChunk = parsed;
    }
  }

  const cleaned = text.trim();
  assert(cleaned.length > 0, "chat completion empty");
  for (const pattern of REASONING_LEAK_PATTERNS) {
    assert(!pattern.test(cleaned), `reasoning leak detected: pattern ${pattern}`);
  }

  return {
    text: cleaned,
    latency: {
      totalDurationNs:
        typeof finalChunk?.total_duration === "number" ? finalChunk.total_duration : undefined,
      evalDurationNs:
        typeof finalChunk?.eval_duration === "number" ? finalChunk.eval_duration : undefined,
      promptEvalDurationNs:
        typeof finalChunk?.prompt_eval_duration === "number"
          ? finalChunk.prompt_eval_duration
          : undefined,
    },
  };
}

async function embedOnce(input) {
  const response = await fetch(`${OLLAMA_BASE_URL}/api/embed`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: EMBED_MODEL,
      input,
    }),
  });

  if (!response.ok) {
    throw new Error(`Embed request failed with status ${response.status}`);
  }

  const data = await response.json();
  if (typeof data.error === "string" && data.error.length > 0) {
    throw new Error(data.error);
  }

  assert(Array.isArray(data.embeddings), "embed response missing embeddings");
  assert(data.embeddings.length > 0, "embed response has empty embeddings");
  const vector = data.embeddings[0];
  assert(Array.isArray(vector), "embed response first embedding invalid");
  assert(vector.every((value) => typeof value === "number"), "embed vector must be numeric");

  return {
    vector,
    latency: {
      totalDurationNs: typeof data.total_duration === "number" ? data.total_duration : undefined,
      loadDurationNs: typeof data.load_duration === "number" ? data.load_duration : undefined,
      promptEvalDurationNs:
        typeof data.prompt_eval_duration === "number" ? data.prompt_eval_duration : undefined,
    },
  };
}

function pushLatency(latencyStore, label, latency) {
  if (latencyStore[label] == null) {
    latencyStore[label] = [];
  }
  latencyStore[label].push(latency);
}

function summarizeLatency(latencyStore) {
  for (const [label, samples] of Object.entries(latencyStore)) {
    const totals = samples
      .map((sample) => sample.totalDurationNs)
      .filter((value) => typeof value === "number");
    if (totals.length === 0) {
      console.log(`[latency] ${label}: total_duration unavailable`);
      continue;
    }
    const average = totals.reduce((sum, n) => sum + n, 0) / totals.length;
    const min = Math.min(...totals);
    const max = Math.max(...totals);
    console.log(
      `[latency] ${label}: avg=${Math.round(average / 1e6)}ms min=${Math.round(
        min / 1e6
      )}ms max=${Math.round(max / 1e6)}ms samples=${totals.length}`
    );
  }
}

async function scenarioDeterministicShortReply(latencyStore, attempt) {
  const result = await chatOnce({
    prompt: "Reply with exact token OK42 only. No punctuation. No extra words.",
    stop: ["\n"],
  });
  assert(/OK42/.test(result.text), "deterministic scenario missing token OK42");
  pushLatency(latencyStore, "chat-deterministic", result.latency);
  console.log(`[smoke] deterministic ${attempt}/${REPEATS}: ${result.text}`);
}

async function scenarioCodeAnswer(latencyStore, attempt) {
  const result = await chatOnce({
    prompt:
      "Write Python function `is_even(n)` in 2 lines max. Return only code, no markdown fences.",
  });
  assert(result.text.includes("def is_even"), "code scenario missing function definition");
  assert(result.text.includes("return"), "code scenario missing return");
  pushLatency(latencyStore, "chat-code", result.latency);
  console.log(`[smoke] code ${attempt}/${REPEATS}:`);
  console.log(result.text);
}

async function scenarioRetrievalAssisted(latencyStore, attempt) {
  const chunks = [
    "CONTEXT_SIGNAL: RACE_ALPHA_17. Project codename is Falcon.",
    "Random unrelated note about weather and rain.",
    "Another unrelated sentence about coffee brewing.",
  ];
  const query = "What is context signal token?";

  const queryEmbed = await embedOnce(query);
  const chunkEmbeds = [];
  for (const chunk of chunks) {
    chunkEmbeds.push(await embedOnce(chunk));
  }

  const ranked = chunkEmbeds
    .map((embed, index) => ({
      index,
      similarity: cosineSimilarity(embed.vector, queryEmbed.vector),
      content: chunks[index],
    }))
    .sort((a, b) => b.similarity - a.similarity);

  const topChunk = ranked[0];
  assert(topChunk != null, "retrieval scenario has no ranked chunk");
  const prompt = [
    "Use only provided context.",
    "Return context signal token exactly.",
    "",
    `Context: ${topChunk.content}`,
    `Question: ${query}`,
  ].join("\n");

  const result = await chatOnce({ prompt, stop: ["\n"] });
  assert(
    result.text.includes("RACE_ALPHA_17"),
    "retrieval scenario missing expected context signal"
  );

  pushLatency(latencyStore, "chat-retrieval", result.latency);
  pushLatency(latencyStore, "embed-retrieval-query", queryEmbed.latency);
  chunkEmbeds.forEach((embed) => pushLatency(latencyStore, "embed-retrieval-chunks", embed.latency));
  console.log(`[smoke] retrieval ${attempt}/${REPEATS}: ${result.text}`);
}

async function scenarioEmbeddingRanking(latencyStore, attempt) {
  const query = "sort array ascending in python";
  const related = "Use sorted(values) or values.sort() to sort ascending in Python.";
  const unrelated = "The mountain trail has snow and pine trees.";

  const queryEmbed = await embedOnce(query);
  const relatedEmbed = await embedOnce(related);
  const unrelatedEmbed = await embedOnce(unrelated);

  const dim = queryEmbed.vector.length;
  assert(dim > 0, "embedding vector empty");
  assert(relatedEmbed.vector.length === dim, "related embedding dimension mismatch");
  assert(unrelatedEmbed.vector.length === dim, "unrelated embedding dimension mismatch");

  const relatedScore = cosineSimilarity(queryEmbed.vector, relatedEmbed.vector);
  const unrelatedScore = cosineSimilarity(queryEmbed.vector, unrelatedEmbed.vector);
  assert(
    relatedScore > unrelatedScore,
    `embedding ranking invalid: related=${relatedScore} unrelated=${unrelatedScore}`
  );

  pushLatency(latencyStore, "embed-ranking-query", queryEmbed.latency);
  pushLatency(latencyStore, "embed-ranking-related", relatedEmbed.latency);
  pushLatency(latencyStore, "embed-ranking-unrelated", unrelatedEmbed.latency);
  console.log(
    `[smoke] embed-ranking ${attempt}/${REPEATS}: related=${relatedScore.toFixed(
      4
    )} unrelated=${unrelatedScore.toFixed(4)} dim=${dim}`
  );
}

async function run() {
  console.log(`[smoke] Ollama URL: ${OLLAMA_BASE_URL}`);
  console.log(`[smoke] Chat model: ${CHAT_MODEL}`);
  console.log(`[smoke] Embed model: ${EMBED_MODEL}`);
  console.log(`[smoke] Repeats: ${REPEATS}`);

  assert(REPEATS >= 2, "REPEATS must be at least 2");

  const latencyStore = {};

  for (let attempt = 1; attempt <= REPEATS; attempt += 1) {
    await scenarioDeterministicShortReply(latencyStore, attempt);
    await scenarioCodeAnswer(latencyStore, attempt);
    await scenarioRetrievalAssisted(latencyStore, attempt);
    await scenarioEmbeddingRanking(latencyStore, attempt);
  }

  console.log("[smoke] all chat+embedding scenarios passed");
  summarizeLatency(latencyStore);
}

run().catch((error) => {
  console.error(`[smoke] failed: ${error.message}`);
  process.exitCode = 1;
});
