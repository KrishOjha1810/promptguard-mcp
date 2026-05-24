#!/usr/bin/env node
// Claude Code UserPromptSubmit hook.
//
// Reads the user's prompt JSON from stdin, scans it for secrets and PII,
// and writes a JSON response on stdout that Claude Code surfaces as a
// system message in the conversation. Never blocks the prompt.
//
// Install: add this to ~/.claude/settings.json
//
//   "hooks": {
//     "UserPromptSubmit": [{
//       "hooks": [{
//         "type": "command",
//         "command": "npx -y -p @promptguardapp/mcp promptguard-hook",
//         "timeout": 5
//       }]
//     }]
//   }

import { readFileSync } from "node:fs";
import { scanText } from "./detectors/secrets.js";

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

const result = scanText(prompt);

if (result.findings.length === 0) {
  console.log("{}");
  process.exit(0);
}

const lines = result.findings.map(
  (f, i) =>
    `${i + 1}. [${f.severity.toUpperCase()}] ${f.rule}: ${f.explanation}`,
);

const count = result.findings.length;
const message =
  `⚠  PromptGuard found ${count} sensitive item${count === 1 ? "" : "s"} in your prompt:\n\n` +
  lines.join("\n") +
  `\n\nThe prompt was sent as is. To redact before sending next time, ask Claude to use the scan_prompt tool with mode redact first.`;

console.log(
  JSON.stringify({
    systemMessage: message,
  }),
);
