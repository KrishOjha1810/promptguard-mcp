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
// Compression flags: a prompt that opens with `pg ` (or `pg! ` for the lossy
// caveman level) is compressed; the short version is copied to the clipboard
// and the long one is blocked, so you paste-and-send the tightened prompt. The
// hook API cannot replace a prompt in place, so paste is as seamless as it gets
// inside Claude Code; the browser extension does this fully automatically.
//
// Env vars:
//   PROMPTGUARD_BLOCK_ON_SECRETS   default "true"  (block on critical)
//   PROMPTGUARD_BLOCK_ON_PII       default "false" (warn on medium/high)
//   PROMPTGUARD_BLOCK_ON_OPTIMIZE  default "false" (tip on optimize)
//   PROMPTGUARD_COMPRESS_FLAGS     default "true"  (handle pg / pg! flags)
//
// Set PROMPTGUARD_BLOCK_ON_SECRETS=false to make even critical findings
// non-blocking (not recommended).

import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { scanText } from "./detectors/secrets.js";
import { optimizePrompt } from "./optimize.js";
import { compressForSend } from "./compress-flag.js";
import type { Finding } from "./types.js";

const BLOCK_ON_SECRETS = process.env.PROMPTGUARD_BLOCK_ON_SECRETS !== "false";
// Compress-and-paste is on by default; set to "false" to ignore the pg/pg! flags.
const COMPRESS_FLAGS = process.env.PROMPTGUARD_COMPRESS_FLAGS !== "false";

// Best-effort copy to the OS clipboard. The hook cannot replace your prompt
// (the Claude Code hook API only allows adding context or blocking), so the
// next best thing is to put the compressed text where one paste can reach it.
function copyToClipboard(text: string): boolean {
  try {
    if (process.platform === "darwin") {
      execFileSync("pbcopy", { input: text });
      return true;
    }
    if (process.platform === "win32") {
      execFileSync("clip", { input: text });
      return true;
    }
    try {
      execFileSync("wl-copy", { input: text });
      return true;
    } catch {
      execFileSync("xclip", ["-selection", "clipboard"], { input: text });
      return true;
    }
  } catch {
    return false;
  }
}
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

// Critical findings: block by default. Secrets always take precedence over
// the compression flag below, so a flagged prompt that still leaks a key is
// caught here first.
if (critical.length > 0 && BLOCK_ON_SECRETS) {
  emit({
    continue: false,
    stopReason:
      `🛑 PromptGuard BLOCKED this prompt because it contains ${critical.length} critical secret${critical.length === 1 ? "" : "s"}:\n\n` +
      formatFindings(critical) +
      `\n\nRedact the secret and resend. To send anyway (not recommended), set PROMPTGUARD_BLOCK_ON_SECRETS=false in your environment.`,
  });
}

// Compression flag (pg / pg!): the hook cannot replace the prompt, so it
// compresses, copies the short version to the clipboard, and blocks the long
// one. You paste (one keystroke) and send the tightened version.
if (COMPRESS_FLAGS) {
  const outcome = compressForSend(prompt);
  if (outcome) {
    const copied = copyToClipboard(outcome.sentText);
    const savings =
      outcome.tokensSaved > 0
        ? `${outcome.level}, saved ${outcome.tokensSaved} tokens (${outcome.percentSaved}%)`
        : `${outcome.level}, already concise`;
    const howto = copied
      ? `Copied to your clipboard. Clear the box, paste (⌘V / Ctrl+V), and send.`
      : `Copy the tightened prompt below and send it.`;
    emit({
      continue: false,
      stopReason:
        `✂️  PromptGuard compressed your prompt (${savings}).\n` +
        `${howto}\n\n` +
        `--- tightened prompt ---\n${outcome.sentText}\n------------------------\n\n` +
        `(The hook can't auto-send a rewritten prompt; set PROMPTGUARD_COMPRESS_FLAGS=false to disable the pg/pg! flags.)`,
    });
  }
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
