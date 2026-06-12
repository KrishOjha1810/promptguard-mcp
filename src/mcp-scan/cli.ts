import { readFileSync, writeFileSync } from "node:fs";
import { scanMcp, tolerantParse } from "./scanner.js";
import { toSarif } from "./sarif.js";
import { buildLock, diffAgainstLock, type Lockfile } from "./pinning.js";
import type { McpDocument, McpScanResult } from "./types.js";
import type { Severity } from "../types.js";

const SEVERITY_ORDER: Record<Severity, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

const COLORS = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  green: "\x1b[32m",
  gray: "\x1b[90m",
};

function sevColor(sev: Severity): string {
  if (sev === "critical") return COLORS.red;
  if (sev === "high") return COLORS.yellow;
  if (sev === "medium") return COLORS.blue;
  return COLORS.gray;
}

function useColor(): boolean {
  return process.stdout.isTTY === true && !process.env.NO_COLOR;
}

function paint(s: string, color: string): string {
  return useColor() ? `${color}${s}${COLORS.reset}` : s;
}

const USAGE = `PromptGuard scan-mcp, local MCP/agent security scanner.

Scans an MCP config file or tools/list document for:
  - hardcoded secrets in config (env, args, url)
  - tool-poisoning instructions hidden in tool fields (full-schema)
  - hidden/invisible unicode in tool text
  - tool-name shadowing across servers

Everything runs locally. No account, no network, no telemetry.

Usage:
  scan-mcp <file>                 scan a file, human-readable output
  scan-mcp <file> --sarif         emit SARIF 2.1.0 JSON (for CI / code scanning)
  scan-mcp <file> --json          emit raw findings as JSON
  scan-mcp --stdin                read the document from stdin
  scan-mcp --fail-on <level>      exit non-zero at/above level (default: high)
                                  levels: low | medium | high | critical | never
  scan-mcp pin <file>             approve current tool definitions: write a
                                  lockfile of per-tool hashes (<file>.pglock)
  scan-mcp <file> --lockfile <p>  compare against a specific lockfile
  scan-mcp <file> --no-drift      skip rug-pull / drift checking

Rug-pull detection:
  After 'pin', a later scan compares each tool definition to its approved
  hash. A CHANGED definition is flagged critical (the rug-pull pattern). New
  and removed tools are flagged too. All local, no account.

Exit codes:
  0  no findings at or above the fail-on level
  1  findings at or above the fail-on level (CI gate fails)
  2  usage or read error
`;

function defaultLockPath(file: string): string {
  return `${file}.pglock`;
}

function loadLock(path: string): Lockfile | null {
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    if (parsed && typeof parsed === "object" && parsed.pins) return parsed as Lockfile;
    return null;
  } catch {
    return null;
  }
}

function runPin(args: string[]): number {
  const file = args.find((a) => !a.startsWith("--"));
  if (!file) {
    process.stderr.write("scan-mcp pin: provide a file to pin.\n");
    return 2;
  }
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    process.stderr.write(`scan-mcp pin: could not read ${file}.\n`);
    return 2;
  }
  const doc = tolerantParse(text) as McpDocument | null;
  if (!doc) {
    process.stderr.write("scan-mcp pin: input is not valid JSON; cannot pin.\n");
    return 2;
  }
  const lockIdx = args.indexOf("--lockfile");
  const lockPath = lockIdx >= 0 ? args[lockIdx + 1] : defaultLockPath(file);
  const lock = buildLock(doc);
  writeFileSync(lockPath, JSON.stringify(lock, null, 2) + "\n");
  process.stdout.write(
    `pinned ${Object.keys(lock.pins).length} tool definition(s) to ${lockPath}\n`,
  );
  return 0;
}

function readInput(args: string[]): { text: string; uri: string } | null {
  if (args.includes("--stdin")) {
    try {
      return { text: readFileSync(0, "utf8"), uri: "<stdin>" };
    } catch {
      return null;
    }
  }
  const file = args.find((a) => !a.startsWith("--"));
  if (!file) return null;
  try {
    return { text: readFileSync(file, "utf8"), uri: file };
  } catch {
    return null;
  }
}

function printHuman(result: McpScanResult, uri: string): void {
  const { findings } = result;
  const header = paint("PromptGuard scan-mcp", COLORS.bold);
  process.stderr.write(
    `${header}  ${paint(uri, COLORS.dim)}\n` +
      paint(
        `scanned ${result.serversScanned} server(s), ${result.toolsScanned} tool(s) in ${result.scanMs.toFixed(1)} ms\n\n`,
        COLORS.dim,
      ),
  );

  if (findings.length === 0) {
    process.stdout.write(
      paint("clean: no MCP security issues detected.\n", COLORS.green),
    );
    return;
  }

  const sorted = [...findings].sort(
    (a, b) => SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity],
  );

  for (const f of sorted) {
    const tag = paint(`[${f.severity.toUpperCase()}]`, sevColor(f.severity));
    const owasp = f.owasp.length ? paint(` (${f.owasp.join(", ")})`, COLORS.gray) : "";
    process.stdout.write(
      `${tag} ${paint(f.title, COLORS.bold)}${owasp}\n` +
        `  at ${paint(f.location, COLORS.dim)}\n` +
        `  evidence: ${f.evidence}\n` +
        `  ${paint(f.explanation, COLORS.dim)}\n\n`,
    );
  }

  const counts = sorted.reduce<Record<string, number>>((acc, f) => {
    acc[f.severity] = (acc[f.severity] ?? 0) + 1;
    return acc;
  }, {});
  const summary = (["critical", "high", "medium", "low"] as Severity[])
    .filter((s) => counts[s])
    .map((s) => paint(`${counts[s]} ${s}`, sevColor(s)))
    .join("  ");
  process.stdout.write(`${paint("summary:", COLORS.bold)} ${summary}\n`);
}

export function runCli(argv: string[]): number {
  const args = argv.slice();
  if (args.includes("--help") || args.includes("-h") || args.length === 0) {
    process.stdout.write(USAGE);
    return args.length === 0 ? 2 : 0;
  }

  if (args[0] === "pin") {
    return runPin(args.slice(1));
  }

  const input = readInput(args);
  if (!input) {
    process.stderr.write("scan-mcp: could not read input file or stdin.\n\n");
    process.stdout.write(USAGE);
    return 2;
  }

  const failOnIdx = args.indexOf("--fail-on");
  const failOn = failOnIdx >= 0 ? args[failOnIdx + 1] : "high";

  const result = scanMcp(input.text);

  // Rug-pull / drift: compare against a lockfile if present.
  if (!args.includes("--no-drift")) {
    const lockIdx = args.indexOf("--lockfile");
    const lockPath =
      lockIdx >= 0
        ? args[lockIdx + 1]
        : input.uri !== "<stdin>"
          ? defaultLockPath(input.uri)
          : null;
    if (lockPath) {
      const lock = loadLock(lockPath);
      if (lock) {
        const doc = tolerantParse(input.text) as McpDocument | null;
        if (doc) result.findings.push(...diffAgainstLock(doc, lock));
      }
    }
  }

  if (args.includes("--sarif")) {
    process.stdout.write(JSON.stringify(toSarif(result, input.uri), null, 2) + "\n");
  } else if (args.includes("--json")) {
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  } else {
    printHuman(result, input.uri);
  }

  if (failOn === "never") return 0;
  const threshold = SEVERITY_ORDER[failOn as Severity] ?? SEVERITY_ORDER.high;
  const worst = result.findings.reduce(
    (max, f) => Math.max(max, SEVERITY_ORDER[f.severity]),
    0,
  );
  return worst >= threshold ? 1 : 0;
}
