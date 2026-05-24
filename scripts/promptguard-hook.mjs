#!/usr/bin/env node
// Claude Code UserPromptSubmit hook.
//
// Reads the user's prompt JSON on stdin, scans it for secrets and PII using
// the local PromptGuard engine, and writes a JSON response on stdout that
// Claude Code surfaces as a system message in the conversation. Never blocks
// the prompt, just warns. The user decides whether to retry redacted.
//
// Install: add to ~/.claude/settings.json as a hook for UserPromptSubmit.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ENGINE_PATH = resolve(__dirname, "../dist/detectors/secrets.js");

let scanText;
try {
  ({ scanText } = await import(ENGINE_PATH));
} catch (err) {
  // If the engine is not built, do not break the user's prompt flow.
  console.log("{}");
  process.exit(0);
}

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

let input;
try {
  input = JSON.parse(raw);
} catch {
  console.log("{}");
  process.exit(0);
}

// Claude Code's UserPromptSubmit hook sends the typed prompt under several
// possible keys depending on the runtime. Try the common ones.
const prompt =
  input.prompt ??
  input.user_prompt ??
  input.text ??
  input.message ??
  input.content ??
  "";

if (typeof prompt !== "string" || prompt.length === 0) {
  console.log("{}");
  process.exit(0);
}

const result = scanText(prompt);

if (result.findings.length === 0) {
  console.log("{}");
  process.exit(0);
}

const lines = result.findings.map(
  (f, i) =>
    `${i + 1}. [${f.severity.toUpperCase()}] ${f.rule}: ${f.explanation}`,
);

const message =
  `⚠  PromptGuard found ${result.findings.length} sensitive item${result.findings.length === 1 ? "" : "s"} in your prompt:\n\n` +
  lines.join("\n") +
  `\n\nThe prompt was sent as is. To redact before sending next time, ask Claude to "use the scan_prompt tool with mode redact" first.`;

console.log(
  JSON.stringify({
    systemMessage: message,
  }),
);
