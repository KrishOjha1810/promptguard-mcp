#!/usr/bin/env node
// Claude Code SessionStart hook: the always-on layer. On every session start it
// (1) statically scans known MCP config locations for poisoning/secrets, and
// (2) runs the continuous rug-pull monitor, auto-pinning new tools silently and
// surfacing any tool definition that CHANGED since you approved it. Local only,
// never blocks. Install by adding to ~/.claude/settings.json:
//
//   "hooks": { "SessionStart": [ { "hooks": [ {
//     "type": "command",
//     "command": "npx --yes --package=@promptguardapp/mcp -- promptguard-mcp-session-hook"
//   } ] } ] }

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { scanMcp, tolerantParse } from "./scanner.js";
import { runMonitor, emptyStore, type MonitorStore } from "./monitor.js";
import type { McpDocument, McpFinding } from "./types.js";

function candidatePaths(): string[] {
  const home = homedir();
  return [
    join(process.cwd(), ".mcp.json"),
    join(process.cwd(), ".cursor", "mcp.json"),
    join(home, "Library", "Application Support", "Claude", "claude_desktop_config.json"),
    join(home, ".config", "claude", "claude_desktop_config.json"),
    join(home, ".cursor", "mcp.json"),
  ];
}

function storePath(): string {
  return join(homedir(), ".promptguard", "pins.json");
}

function loadStore(): MonitorStore {
  try {
    const parsed = JSON.parse(readFileSync(storePath(), "utf8"));
    if (parsed && typeof parsed === "object" && parsed.pins) return parsed as MonitorStore;
  } catch {
    /* first run */
  }
  return emptyStore();
}

function saveStore(store: MonitorStore): void {
  try {
    mkdirSync(dirname(storePath()), { recursive: true });
    writeFileSync(storePath(), JSON.stringify(store, null, 2) + "\n");
  } catch {
    /* best effort; never block the session */
  }
}

function emit(payload: object): never {
  process.stdout.write(JSON.stringify(payload));
  process.exit(0);
}

const configs: { path: string; doc: McpDocument }[] = [];
const staticFindings: { path: string; findings: McpFinding[] }[] = [];

for (const p of candidatePaths()) {
  let text: string;
  try {
    text = readFileSync(p, "utf8");
  } catch {
    continue;
  }
  // Static scan (poisoning / secrets), high/critical only for the heads-up.
  const sf = scanMcp(text).findings.filter(
    (f) => f.category !== "parse_warning" && (f.severity === "critical" || f.severity === "high"),
  );
  if (sf.length) staticFindings.push({ path: p, findings: sf });

  const doc = tolerantParse(text) as McpDocument | null;
  if (doc) configs.push({ path: p, doc });
}

// Continuous rug-pull monitor (auto-pin new, diff seen).
const monitor = runMonitor(configs, loadStore());
saveStore(monitor.store);

const driftHighCrit = monitor.findings.filter(
  (f) => f.severity === "critical" || f.severity === "high",
);

if (staticFindings.length === 0 && driftHighCrit.length === 0) {
  // Clean, or first-ever run that just pinned everything. Stay silent.
  emit({});
}

const lines: string[] = [];

if (driftHighCrit.length > 0) {
  lines.push("Tool definitions CHANGED since you approved them (possible rug-pull):");
  for (const f of driftHighCrit) lines.push(`  [${f.severity.toUpperCase()}] ${f.title} at ${f.location}`);
}

for (const { path, findings } of staticFindings) {
  lines.push(`In ${path}:`);
  for (const f of findings) lines.push(`  [${f.severity.toUpperCase()}] ${f.title} at ${f.location}`);
}

const total = driftHighCrit.length + staticFindings.reduce((n, s) => n + s.findings.length, 0);

emit({
  systemMessage:
    `PromptGuard MCP check found ${total} high/critical issue${total === 1 ? "" : "s"}:\n\n` +
    lines.join("\n") +
    `\n\nRun 'npx @promptguardapp/mcp scan-mcp <config>' for detail. Heads-up, not a block.`,
});
