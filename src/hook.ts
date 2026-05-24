#!/usr/bin/env node
// Claude Code UserPromptSubmit hook.
//
// Reads the user's prompt from stdin, runs two passes locally:
//  1. scan for secrets and PII
//  2. if no findings, check whether the prompt could be tightened
//
// Writes a JSON response that Claude Code surfaces as a system message in
// the conversation. Never blocks the prompt.

import { readFileSync } from "node:fs";
import { scanText } from "./detectors/secrets.js";
import { optimizePrompt } from "./optimize.js";

let raw = "";
try {
  raw = readFileSync(0, "utf8");
} catch {
  console.log("{}");
  process.exit(0);
}

if (!raw.trim()) {
  console.log("{}");
  process.exit(0);
}

let input: Record<string, unknown>;
try {
  input = JSON.parse(raw);
} catch {
  console.log("{}");
  process.exit(0);
}

const prompt =
  (input.prompt as string | undefined) ??
  (input.user_prompt as string | undefined) ??
  (input.text as string | undefined) ??
  (input.message as string | undefined) ??
  (input.content as string | undefined) ??
  "";

if (typeof prompt !== "string" || prompt.length === 0) {
  console.log("{}");
  process.exit(0);
}

// Pass 1: scan for secrets / PII (always priority over tightening)
const scanResult = scanText(prompt);

if (scanResult.findings.length > 0) {
  const lines = scanResult.findings.map(
    (f, i) =>
      `${i + 1}. [${f.severity.toUpperCase()}] ${f.rule}: ${f.explanation}`,
  );
  const count = scanResult.findings.length;
  const message =
    `⚠  PromptGuard found ${count} sensitive item${count === 1 ? "" : "s"} in your prompt:\n\n` +
    lines.join("\n") +
    `\n\nThe prompt was sent as is. To redact before sending next time, ask Claude to use the scan_prompt tool with mode redact first.`;
  console.log(JSON.stringify({ systemMessage: message }));
  process.exit(0);
}

// Pass 2: prompt is clean of sensitive data, check whether it could be tighter
const optimizeResult = optimizePrompt(prompt);

if (optimizeResult.shouldSuggest && optimizeResult.tokensSaved >= 3) {
  const message =
    `💡 PromptGuard tip: your prompt could be ${optimizeResult.percentSaved}% shorter (~${optimizeResult.tokensSaved} tokens saved).\n\n` +
    `Suggested rewrite:\n${optimizeResult.optimizedText}\n\n` +
    `Your original prompt was sent as is. This is a heuristic suggestion only.`;
  console.log(JSON.stringify({ systemMessage: message }));
  process.exit(0);
}

// Clean prompt, nothing useful to add
console.log("{}");
