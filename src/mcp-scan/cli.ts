import { readFileSync, writeFileSync } from "node:fs";
import { scanMcp, tolerantParse } from "./scanner.js";
import { toSarif } from "./sarif.js";
import { buildLock, diffAgainstLock, type Lockfile } from "./pinning.js";
import { loadCorpus, runBenchmark, defaultCorpusPath } from "./bench.js";
import { loadManifest, scanRegistry, renderLeaderboard } from "./registry.js";
import {
  recordTrace,
  buildAuditLog,
  serializeLog,
  verifyLog,
  exportArticle12,
  computeAnchor,
  externalDestinationsIn,
} from "./recorder.js";
import {
  ensureKeypair,
  loadPublicKey,
  defaultPublicKeyPath,
  defaultKeyDir,
  parseAnchorToken,
  appendAnchorHistory,
} from "./signing.js";
import { hashToken } from "./entropy.js";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

function destinationsPath(): string {
  return join(defaultKeyDir(), "destinations.json");
}

function allowedTokensPath(): string {
  return join(defaultKeyDir(), "allowed-tokens.json");
}

function loadAllowedTokens(): Set<string> {
  try {
    const arr = JSON.parse(readFileSync(allowedTokensPath(), "utf8"));
    if (Array.isArray(arr)) return new Set(arr as string[]);
  } catch {
    /* none yet */
  }
  return new Set();
}

function saveAllowedTokens(set: Set<string>): void {
  try {
    mkdirSync(defaultKeyDir(), { recursive: true });
    writeFileSync(allowedTokensPath(), JSON.stringify([...set].sort(), null, 2) + "\n");
  } catch {
    /* best effort */
  }
}

function loadKnownDestinations(): Set<string> {
  try {
    const arr = JSON.parse(readFileSync(destinationsPath(), "utf8"));
    if (Array.isArray(arr)) return new Set(arr as string[]);
  } catch {
    /* none yet */
  }
  return new Set();
}

function saveKnownDestinations(set: Set<string>): void {
  try {
    mkdirSync(defaultKeyDir(), { recursive: true });
    writeFileSync(destinationsPath(), JSON.stringify([...set].sort(), null, 2) + "\n");
  } catch {
    /* best effort */
  }
}
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
  scan-mcp bench [corpus]         run the public benchmark corpus
  scan-mcp registry <manifest>    render a server safety leaderboard

  Flight recorder (runtime, from the agent's OpenTelemetry tool-call spans):
  scan-mcp record <trace.jsonl>   scan tool-call args + results, detect toxic
                                  flows; --log <f> writes a hash-chained audit
                                  log; --sign signs each record (Ed25519, local
                                  key); --export-aat <f> writes an EU AI Act
                                  Article 12 export
  scan-mcp verify <log.jsonl>     check the hash chain for tampering; --key <p>
                                  also verifies signatures; --anchor <token>
                                  checks the head matches a recorded anchor
  scan-mcp anchor <log.jsonl>     print an externally-recordable anchor token
                                  for the chain head

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

function flagVal(args: string[], flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
}

function runRecord(args: string[]): number {
  const file = args.find((a) => !a.startsWith("--"));
  if (!file) {
    process.stderr.write("scan-mcp record: provide an OTel trace JSONL file (or --stdin).\n");
    return 2;
  }
  let text: string;
  try {
    text = readFileSync(args.includes("--stdin") ? 0 : file, "utf8");
  } catch {
    process.stderr.write(`scan-mcp record: could not read ${file}.\n`);
    return 2;
  }
  // Behavioral novelty: load destinations seen in prior sessions so a
  // first-seen destination receiving tainted data scores critical. Disable with
  // --no-memory (treats every run as the first, denylist-only).
  const known = args.includes("--no-memory") ? new Set<string>() : loadKnownDestinations();
  const result = recordTrace(text, {
    knownDestinations: known,
    detectEntropy: !args.includes("--no-entropy"),
    allowedTokenHashes: loadAllowedTokens(),
  });
  if (!args.includes("--no-memory")) {
    for (const d of externalDestinationsIn(result.events)) known.add(d);
    saveKnownDestinations(known);
  }
  const meta = {
    agentId: flagVal(args, "--agent-id") ?? "unknown-agent",
    agentVersion: flagVal(args, "--agent-version") ?? "0",
    sessionId: flagVal(args, "--session-id") ?? "session",
  };

  process.stderr.write(
    `PromptGuard flight recorder  ${file}\n` +
      `${result.events.length} tool call(s), ${result.findings.length} finding(s)\n\n`,
  );

  if (result.findings.length === 0) {
    process.stdout.write("clean: no runtime security issues in this trace.\n");
  } else {
    const order: Record<Severity, number> = { low: 1, medium: 2, high: 3, critical: 4 };
    for (const f of [...result.findings].sort((a, b) => order[b.severity] - order[a.severity])) {
      process.stdout.write(
        `[${f.severity.toUpperCase()}] ${f.title} (${f.owasp.join(", ")})\n` +
          `  at ${f.location}\n  ${f.evidence}\n  ${f.explanation}\n\n`,
      );
    }
  }

  const logOut = flagVal(args, "--log");
  if (logOut) {
    const signer = args.includes("--sign")
      ? (() => {
          const kp = ensureKeypair();
          return { privateKeyPem: kp.privateKeyPem, fingerprint: kp.fingerprint };
        })()
      : undefined;
    const records = buildAuditLog(result, meta, signer);
    writeFileSync(logOut, serializeLog(records));
    const anchor = computeAnchor(serializeLog(records));
    appendAnchorHistory(anchor);
    process.stderr.write(
      `audit log written to ${logOut}` +
        (signer ? ` (signed, key ${signer.fingerprint})` : " (unsigned)") +
        `\nanchor: ${anchor.token}\n` +
        `record that anchor externally (commit it, write it down) to detect later rewrites\n`,
    );
  }
  const aatOut = flagVal(args, "--export-aat");
  if (aatOut) {
    writeFileSync(aatOut, JSON.stringify(exportArticle12(result, meta), null, 2) + "\n");
    process.stderr.write(`EU AI Act Article 12 export written to ${aatOut}\n`);
  }

  return result.findings.some((f) => f.severity === "critical" || f.severity === "high") ? 1 : 0;
}

function runVerify(args: string[]): number {
  const file = args.find((a) => !a.startsWith("--"));
  if (!file) {
    process.stderr.write("scan-mcp verify: provide an audit-log JSONL file.\n");
    return 2;
  }
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    process.stderr.write(`scan-mcp verify: could not read ${file}.\n`);
    return 2;
  }
  // Optional signature check: explicit --key, or the default local public key
  // if one exists.
  let publicKeyPem: string | undefined;
  const keyPath = flagVal(args, "--key");
  if (keyPath) {
    try {
      publicKeyPem = loadPublicKey(keyPath);
    } catch {
      process.stderr.write(`scan-mcp verify: could not read key ${keyPath}.\n`);
      return 2;
    }
  } else if (existsSync(defaultPublicKeyPath())) {
    publicKeyPem = loadPublicKey(defaultPublicKeyPath());
  }

  const anchorTok = flagVal(args, "--anchor");
  const anchor = anchorTok ? parseAnchorToken(anchorTok) ?? undefined : undefined;
  if (anchorTok && !anchor) {
    process.stderr.write("scan-mcp verify: --anchor value is not a valid pg-anchor token.\n");
    return 2;
  }

  const result = verifyLog(text, { publicKeyPem, anchor });
  if (result.ok) {
    const parts = ["chain intact: every record links to the previous one"];
    if (result.signaturesChecked) parts.push(`${result.signaturesChecked} signature(s) valid`);
    if (anchor) parts.push("head matches the recorded anchor");
    process.stdout.write(parts.join("; ") + ". No tampering detected.\n");
    return 0;
  }
  process.stdout.write(
    `TAMPERING DETECTED${result.brokenAt !== undefined ? ` at record ${result.brokenAt}` : ""}: ${result.reason}\n`,
  );
  return 1;
}

function runAnchor(args: string[]): number {
  const file = args.find((a) => !a.startsWith("--"));
  if (!file) {
    process.stderr.write("scan-mcp anchor: provide an audit-log JSONL file.\n");
    return 2;
  }
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    process.stderr.write(`scan-mcp anchor: could not read ${file}.\n`);
    return 2;
  }
  const anchor = computeAnchor(text);
  appendAnchorHistory(anchor);
  process.stdout.write(anchor.token + "\n");
  process.stderr.write(
    "Record this token somewhere the log's writer cannot change (a git commit, a note).\n" +
      "Later: scan-mcp verify <log> --anchor <token> proves it was not rewritten.\n",
  );
  return 0;
}

function runRegistry(args: string[]): number {
  const manifestPath = args.find((a) => !a.startsWith("--"));
  if (!manifestPath) {
    process.stderr.write("scan-mcp registry: provide a manifest JSON path.\n");
    return 2;
  }
  let manifest;
  try {
    manifest = loadManifest(manifestPath);
  } catch {
    process.stderr.write(`scan-mcp registry: could not read manifest ${manifestPath}.\n`);
    return 2;
  }
  const rows = scanRegistry(manifest, manifestPath);
  const generatedOn = new Date().toISOString().slice(0, 10);
  const md = renderLeaderboard(rows, generatedOn);
  const outIdx = args.indexOf("--out");
  if (outIdx >= 0) {
    writeFileSync(args[outIdx + 1], md);
    process.stdout.write(`wrote leaderboard to ${args[outIdx + 1]}\n`);
  } else {
    process.stdout.write(md);
  }
  return 0;
}

function runBench(args: string[]): number {
  const path = args.find((a) => !a.startsWith("--")) ?? defaultCorpusPath();
  let corpus;
  try {
    corpus = loadCorpus(path);
  } catch {
    process.stderr.write(`scan-mcp bench: could not read corpus at ${path}.\n`);
    return 2;
  }
  const report = runBenchmark(corpus);
  for (const r of report.caseResults) {
    const mark = r.pass ? "PASS" : "FAIL";
    process.stdout.write(`[${mark}] ${r.id}  ${r.title}\n        ${r.reason}\n`);
  }
  process.stdout.write(
    `\nrecall ${(report.recall * 100).toFixed(1)}% (${report.detected}/${report.malicious} malicious caught), ` +
      `${report.falsePositives} false positive(s) on ${report.benign} benign control(s)\n`,
  );
  return report.recall >= 1 && report.falsePositives === 0 ? 0 : 1;
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

  if (args[0] === "bench") {
    return runBench(args.slice(1));
  }

  if (args[0] === "registry") {
    return runRegistry(args.slice(1));
  }

  if (args[0] === "record") {
    return runRecord(args.slice(1));
  }

  if (args[0] === "verify") {
    return runVerify(args.slice(1));
  }

  if (args[0] === "anchor") {
    return runAnchor(args.slice(1));
  }

  if (args[0] === "allow") {
    const token = args[1];
    if (!token) {
      process.stderr.write("scan-mcp allow: provide the token to mark benign.\n");
      return 2;
    }
    const set = loadAllowedTokens();
    set.add(hashToken(token));
    saveAllowedTokens(set);
    process.stdout.write("token marked benign; it will no longer be flagged by entropy detection.\n");
    return 0;
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
