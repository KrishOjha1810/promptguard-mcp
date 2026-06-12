import { createHash } from "node:crypto";
import type { McpDocument, McpFinding, McpServerEntry } from "./types.js";

// Stable stringify: sort object keys recursively so semantically identical
// definitions hash identically regardless of key order.
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(stableStringify).join(",") + "]";
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + stableStringify(obj[k])).join(",") + "}";
}

export function hashTool(tool: unknown): string {
  return "sha256:" + createHash("sha256").update(stableStringify(tool)).digest("hex");
}

export type CollectedTool = {
  key: string;
  name: string;
  location: string;
  hash: string;
};

// Collect every tool across servers and top-level, with a stable key. Duplicate
// names get an index suffix so collisions do not collapse into one entry.
export function collectTools(doc: McpDocument): CollectedTool[] {
  const out: CollectedTool[] = [];
  const seen = new Map<string, number>();

  const add = (tool: unknown, serverPrefix: string, location: string) => {
    let name = "(unnamed)";
    if (tool && typeof tool === "object" && typeof (tool as { name?: unknown }).name === "string") {
      name = (tool as { name: string }).name;
    }
    let key = `${serverPrefix}/${name}`;
    const n = seen.get(key) ?? 0;
    seen.set(key, n + 1);
    if (n > 0) key = `${key}#${n}`;
    out.push({ key, name, location, hash: hashTool(tool) });
  };

  const handleMap = (map: Record<string, McpServerEntry>) => {
    for (const [server, entry] of Object.entries(map)) {
      if (Array.isArray(entry.tools)) {
        entry.tools.forEach((t, i) =>
          add(t, server, `mcpServers.${server}.tools[${i}]`),
        );
      }
    }
  };

  if (doc.mcpServers) handleMap(doc.mcpServers);
  if (doc.servers) handleMap(doc.servers);
  if (Array.isArray(doc.tools)) {
    doc.tools.forEach((t, i) => add(t, "(root)", `tools[${i}]`));
  }
  return out;
}

export type Lockfile = {
  version: number;
  tool: string;
  pins: Record<string, { hash: string; location: string }>;
};

export function buildLock(doc: McpDocument): Lockfile {
  const pins: Lockfile["pins"] = {};
  for (const t of collectTools(doc)) {
    pins[t.key] = { hash: t.hash, location: t.location };
  }
  return { version: 1, tool: "promptguard-scan-mcp", pins };
}

// Compare the current document against a saved lockfile and emit drift findings.
// A CHANGED definition is the rug-pull signal and is treated as critical.
export function diffAgainstLock(doc: McpDocument, lock: Lockfile): McpFinding[] {
  const findings: McpFinding[] = [];
  const current = new Map(collectTools(doc).map((t) => [t.key, t]));
  const pinned = new Set(Object.keys(lock.pins));

  for (const [key, cur] of current) {
    const prev = lock.pins[key];
    if (!prev) {
      findings.push({
        category: "drift",
        ruleId: "tool_added",
        title: `New tool since pin: "${cur.name}"`,
        severity: "medium",
        confidence: 0.9,
        location: cur.location,
        evidence: `${key} not present in the lockfile`,
        explanation:
          "A tool appeared that was not in the approved lockfile. New tools should be reviewed and re-pinned before use.",
        owasp: ["LLM03", "T2"],
      });
    } else if (prev.hash !== cur.hash) {
      findings.push({
        category: "rug_pull",
        ruleId: "tool_changed",
        title: `Tool definition CHANGED since pin: "${cur.name}"`,
        severity: "critical",
        confidence: 0.95,
        location: cur.location,
        evidence: `${prev.hash.slice(0, 18)}... -> ${cur.hash.slice(0, 18)}...`,
        explanation:
          "A previously approved tool definition was modified after pinning. This is the rug-pull pattern: a benign tool is approved, then silently swapped for a malicious one. Re-review and re-pin only if the change is expected.",
        owasp: ["LLM01", "LLM03", "T2"],
      });
    }
  }

  for (const key of pinned) {
    if (!current.has(key)) {
      findings.push({
        category: "drift",
        ruleId: "tool_removed",
        title: `Pinned tool removed: "${key.split("/").slice(1).join("/")}"`,
        severity: "low",
        confidence: 0.9,
        location: lock.pins[key].location,
        evidence: `${key} was pinned but is no longer present`,
        explanation:
          "A previously pinned tool is gone. Usually benign, but worth noting if you did not expect it.",
        owasp: ["LLM03"],
      });
    }
  }

  return findings;
}
