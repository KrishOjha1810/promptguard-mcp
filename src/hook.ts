#!/usr/bin/env node
// Claude Code UserPromptSubmit hook.
//
// Reads the user's prompt from stdin, runs two local passes:
//   1. scan for secrets and PII
//   2. if no findings, check whether the prompt could be tightened
//
// Behavior is tiered by severity:
//   - CRITICAL secrets (AWS keys, GitHub tokens, etc.) BLOCK by default.
//     The prompt is not sent to the model. The user sees what was caught
//     and must redact + resend.
//   - HIGH and MEDIUM findings WARN by default. The prompt is sent, the
//     user sees a system message listing what was caught.
//   - Optimize suggestions TIP by default. The prompt is sent, the user
//     sees a brief tip with the suggested rewrite.
//
// Env vars (set any to "true" to make that tier blocking instead):
//   PROMPTGUARD_BLOCK_ON_SECRETS   default "true"  (block on critical)
//   PROMPTGUARD_BLOCK_ON_PII       default "false" (warn on medium/high)
//   PROMPTGUARD_BLOCK_ON_OPTIMIZE  default "false" (tip on optimize)
//
// Set PROMPTGUARD_BLOCK_ON_SECRETS=false to make even critical findings
// non-blocking (not recommended).

import { readFileSync } from "node:fs";
import { scanText } from "./detectors/secrets.js";
import { optimizePrompt } from "./optimize.js";
import type { Finding } from "./types.js";

const BLOCK_ON_SECRETS = process.env.PROMPTGUARD_BLOCK_ON_SECRETS !== "false";
const BLOCK_ON_PII = process.env.PROMPTGUARD_BLOCK_ON_PII === "true";
const BLOCK_ON_OPTIMIZE = process.env.PROMPTGUARD_BLOCK_ON_OPTIMIZE === "true";

function emit(payload: object): never {
  console.log(JSON.stringify(payload));
  process.exit(0);
}

function formatFindings(findings: Finding[]): string {
  return findings
    .map(
      (f, i) =>
        `${i + 1}. [${f.severity.toUpperCase()}] ${f.rule}: ${f.explanation}`,
    )
    .join("\n");
}

let raw = "";
try {
  raw = readFileSync(0, "utf8");
} catch {
  emit({});
}

if (!raw.trim()) emit({});

let input: Record<string, unknown>;
try {
  input = JSON.parse(raw);
} catch {
  emit({});
}

const prompt =
  (input.prompt as string | undefined) ??
  (input.user_prompt as string | undefined) ??
  (input.text as string | undefined) ??
  (input.message as string | undefined) ??
  (input.content as string | undefined) ??
  "";

if (typeof prompt !== "string" || prompt.length === 0) emit({});

// --------------------------------------------------------------------
// Pass 1: scan for secrets and PII
// --------------------------------------------------------------------
const scanResult = scanText(prompt);
const critical = scanResult.findings.filter((f) => f.severity === "critical");
const nonCritical = scanResult.findings.filter(
  (f) => f.severity !== "critical",
);

// Critical findings: block by default
if (critical.length > 0 && BLOCK_ON_SECRETS) {
  emit({
    continue: false,
    stopReason:
      `🛑 PromptGuard BLOCKED this prompt because it contains ${critical.length} critical secret${critical.length === 1 ? "" : "s"}:\n\n` +
      formatFindings(critical) +
      `\n\nRedact the secret and resend. To send anyway (not recommended), set PROMPTGUARD_BLOCK_ON_SECRETS=false in your environment.`,
  });
}

// Non-critical findings: optionally block, otherwise warn
if (nonCritical.length > 0 && BLOCK_ON_PII) {
  emit({
    continue: false,
    stopReason:
      `🛑 PromptGuard BLOCKED this prompt because it contains ${nonCritical.length} sensitive item${nonCritical.length === 1 ? "" : "s"}:\n\n` +
      formatFindings(nonCritical) +
      `\n\nRedact and resend, or set PROMPTGUARD_BLOCK_ON_PII=false to make these warnings only.`,
  });
}

if (scanResult.findings.length > 0) {
  // Warn but allow through (critical-but-not-blocking is also possible if env says so)
  emit({
    systemMessage:
      `⚠  PromptGuard found ${scanResult.findings.length} sensitive item${scanResult.findings.length === 1 ? "" : "s"} in your prompt:\n\n` +
      formatFindings(scanResult.findings) +
      `\n\nThe prompt was sent as is. Set PROMPTGUARD_BLOCK_ON_PII=true to block on PII by default.`,
  });
}

// --------------------------------------------------------------------
// Pass 2: optimize suggestion (only if no scan findings)
// --------------------------------------------------------------------
const optimizeResult = optimizePrompt(prompt);

if (optimizeResult.shouldSuggest && optimizeResult.tokensSaved >= 3) {
  if (BLOCK_ON_OPTIMIZE) {
    emit({
      continue: false,
      stopReason:
        `💡 PromptGuard BLOCKED this prompt because it could be ${optimizeResult.percentSaved}% shorter (~${optimizeResult.tokensSaved} tokens saved):\n\n` +
        `Suggested rewrite:\n${optimizeResult.optimizedText}\n\n` +
        `Copy the suggested version above, or set PROMPTGUARD_BLOCK_ON_OPTIMIZE=false to make this a tip instead of a block.`,
    });
  }
  emit({
    systemMessage:
      `💡 PromptGuard tip: your prompt could be ${optimizeResult.percentSaved}% shorter (~${optimizeResult.tokensSaved} tokens saved).\n\n` +
      `Suggested rewrite:\n${optimizeResult.optimizedText}\n\n` +
      `Original was sent. Set PROMPTGUARD_BLOCK_ON_OPTIMIZE=true to make me block and require you to use the shorter version next time.`,
  });
}

// Clean prompt, nothing to add
emit({});
