#!/usr/bin/env node
// Claude Code SessionStart hook: scan known MCP config locations at the start
// of a session and surface any findings as a system message. Local only; never
// blocks. Install by adding to ~/.claude/settings.json:
//
//   "hooks": {
//     "SessionStart": [{
//       "hooks": [{
//         "type": "command",
//         "command": "npx --yes --package=@promptguardapp/mcp -- promptguard-mcp-session-hook"
//       }]
//     }]
//   }

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { scanMcp } from "./scanner.js";
import type { McpFinding } from "./types.js";

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

function emit(payload: object): never {
  process.stdout.write(JSON.stringify(payload));
  process.exit(0);
}

const all: { path: string; findings: McpFinding[] }[] = [];
for (const p of candidatePaths()) {
  let text: string;
  try {
    text = readFileSync(p, "utf8");
  } catch {
    continue;
  }
  const findings = scanMcp(text).findings.filter(
    (f) => f.category !== "parse_warning" && (f.severity === "critical" || f.severity === "high"),
  );
  if (findings.length) all.push({ path: p, findings });
}

if (all.length === 0) emit({});

const lines: string[] = [];
let count = 0;
for (const { path, findings } of all) {
  lines.push(`In ${path}:`);
  for (const f of findings) {
    count++;
    lines.push(`  [${f.severity.toUpperCase()}] ${f.title} at ${f.location}`);
  }
}

emit({
  systemMessage:
    `PromptGuard scanned your MCP config and found ${count} high/critical issue${count === 1 ? "" : "s"}:\n\n` +
    lines.join("\n") +
    `\n\nRun 'npx @promptguardapp/mcp scan-mcp <config>' for details. This is a heads-up, not a block.`,
});
