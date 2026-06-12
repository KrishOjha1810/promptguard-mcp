import { createHash } from "node:crypto";
import { POISONING_RULES } from "./poisoning-rules.js";
import type { McpDocument, McpFinding, McpServerEntry } from "./types.js";

// JCS-style canonicalization (RFC 8785 spirit): recursively sort object keys
// and emit with no insignificant whitespace, so semantically identical
// definitions canonicalize identically. Good enough for hashing tool defs;
// full RFC 8785 number formatting is not needed for our string-heavy data.
export function jcsCanonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(jcsCanonicalize).join(",") + "]";
  const obj = value as Record<string, unknown>;
  return (
    "{" +
    Object.keys(obj)
      .sort()
      .map((k) => JSON.stringify(k) + ":" + jcsCanonicalize(obj[k]))
      .join(",") +
    "}"
  );
}

function sha256(s: string): string {
  return "sha256:" + createHash("sha256").update(s).digest("hex");
}

export function hashTool(tool: unknown): string {
  return sha256(jcsCanonicalize(tool));
}

// A pin stores per-field fingerprints plus the readable name/description so we
// can show a human, field-level diff (what mcp-scan's single opaque manifest
// hash cannot do). Schema and annotations are kept as canonical strings.
export type ToolPin = {
  name: string;
  description: string;
  schemaCanonical: string;
  annotationsCanonical: string;
  fullHash: string;
  location: string;
};

function toolField(tool: unknown, key: string): unknown {
  if (tool && typeof tool === "object") return (tool as Record<string, unknown>)[key];
  return undefined;
}

export function pinTool(tool: unknown, location: string): ToolPin {
  const name = typeof toolField(tool, "name") === "string" ? (toolField(tool, "name") as string) : "(unnamed)";
  const description =
    typeof toolField(tool, "description") === "string" ? (toolField(tool, "description") as string) : "";
  const schema = toolField(tool, "inputSchema") ?? toolField(tool, "input_schema") ?? null;
  const annotations = toolField(tool, "annotations") ?? null;
  return {
    name,
    description,
    schemaCanonical: jcsCanonicalize(schema),
    annotationsCanonical: jcsCanonicalize(annotations),
    fullHash: hashTool(tool),
    location,
  };
}

export type CollectedTool = { key: string; name: string; location: string; hash: string; pin: ToolPin };

export function collectTools(doc: McpDocument): CollectedTool[] {
  const out: CollectedTool[] = [];
  const seen = new Map<string, number>();

  const add = (tool: unknown, serverPrefix: string, location: string) => {
    const pin = pinTool(tool, location);
    let key = `${serverPrefix}/${pin.name}`;
    const n = seen.get(key) ?? 0;
    seen.set(key, n + 1);
    if (n > 0) key = `${key}#${n}`;
    out.push({ key, name: pin.name, location, hash: pin.fullHash, pin });
  };

  const handleMap = (map: Record<string, McpServerEntry>) => {
    for (const [server, entry] of Object.entries(map)) {
      if (Array.isArray(entry.tools)) {
        entry.tools.forEach((t, i) => add(t, server, `mcpServers.${server}.tools[${i}]`));
      }
    }
  };

  if (doc.mcpServers) handleMap(doc.mcpServers);
  if (doc.servers) handleMap(doc.servers);
  if (Array.isArray(doc.tools)) doc.tools.forEach((t, i) => add(t, "(root)", `tools[${i}]`));
  return out;
}

export type Lockfile = {
  version: number;
  tool: string;
  pins: Record<string, ToolPin>;
};

export function buildLock(doc: McpDocument): Lockfile {
  const pins: Record<string, ToolPin> = {};
  for (const t of collectTools(doc)) pins[t.key] = t.pin;
  return { version: 2, tool: "promptguard-scan-mcp", pins };
}

// Does a piece of text trip any tool-poisoning rule? Used to escalate a
// description change from "review" to "critical rug-pull".
function tripsPoisoning(text: string): string | null {
  for (const rule of POISONING_RULES) {
    rule.pattern.lastIndex = 0;
    if (rule.pattern.test(text)) return rule.id;
  }
  return null;
}

function snippet(s: string, max = 60): string {
  const c = s.replace(/\s+/g, " ").trim();
  return c.length <= max ? c : c.slice(0, max) + "...";
}

// Compare a previously-pinned tool against its current pin, per field, with
// severity tiering. Cosmetic-only changes return nothing; a changed
// description that trips the poisoning rules is a critical rug-pull. Shared by
// diffAgainstLock and the continuous monitor.
export function comparePins(prev: ToolPin, cur: ToolPin): McpFinding[] {
  const findings: McpFinding[] = [];

  // Description changed: the highest-signal field.
  if (prev.description !== cur.description) {
      const tripped = tripsPoisoning(cur.description);
      if (tripped) {
        findings.push({
          category: "rug_pull",
          ruleId: "tool_changed",
          title: `RUG PULL: "${cur.name}" description changed to malicious content`,
          severity: "critical",
          confidence: 0.95,
          location: cur.location,
          evidence: `was: "${snippet(prev.description)}"  now: "${snippet(cur.description)}"  (trips ${tripped})`,
          explanation:
            "A previously approved tool's description was changed after pinning, and the new text trips a tool-poisoning rule. This is the rug-pull pattern: a benign tool is approved, then silently swapped for a malicious one.",
          owasp: ["LLM01", "LLM03", "T2"],
        });
      } else {
        findings.push({
          category: "drift",
          ruleId: "description_changed",
          title: `Description changed since pin: "${cur.name}"`,
          severity: "medium",
          confidence: 0.85,
          location: cur.location,
          evidence: `was: "${snippet(prev.description)}"  now: "${snippet(cur.description)}"`,
          explanation:
            "A previously approved tool's description changed. No malicious pattern detected, but review the change and re-pin if expected.",
          owasp: ["LLM03", "T2"],
        });
      }
    }

    // Schema changed: new parameters can be an exfiltration vector.
    if (prev.schemaCanonical !== cur.schemaCanonical) {
      const grew = cur.schemaCanonical.length > prev.schemaCanonical.length;
      findings.push({
        category: "drift",
        ruleId: "schema_changed",
        title: `Input schema changed since pin: "${cur.name}"`,
        severity: grew ? "high" : "medium",
        confidence: 0.8,
        location: cur.location,
        evidence: grew ? "schema gained fields after approval" : "schema changed after approval",
        explanation:
          "A previously approved tool's input schema changed. Added parameters (especially free-text ones) can become a channel for injected or exfiltrated data. Review before continuing to use.",
        owasp: ["LLM03", "T2"],
      });
    }

  // Annotations changed: e.g. destructiveHint or readOnlyHint flips.
  if (prev.annotationsCanonical !== cur.annotationsCanonical) {
    findings.push({
      category: "drift",
      ruleId: "annotations_changed",
      title: `Tool annotations changed since pin: "${cur.name}"`,
      severity: "high",
      confidence: 0.8,
      location: cur.location,
      evidence: "annotations (e.g. destructive/read-only hints) changed",
      explanation:
        "A tool's behavioral annotations changed after approval. A tool flipping from read-only to destructive after you trusted it is a privilege-escalation risk.",
      owasp: ["LLM03", "T3"],
    });
  }

  return findings;
}

export function diffAgainstLock(doc: McpDocument, lock: Lockfile): McpFinding[] {
  const findings: McpFinding[] = [];
  const current = new Map(collectTools(doc).map((t) => [t.key, t.pin]));

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
      continue;
    }
    findings.push(...comparePins(prev, cur));
  }

  for (const key of Object.keys(lock.pins)) {
    if (!current.has(key)) {
      findings.push({
        category: "drift",
        ruleId: "tool_removed",
        title: `Pinned tool removed: "${key.split("/").slice(1).join("/")}"`,
        severity: "low",
        confidence: 0.9,
        location: lock.pins[key].location,
        evidence: `${key} was pinned but is no longer present`,
        explanation: "A previously pinned tool is gone. Usually benign, but worth noting if unexpected.",
        owasp: ["LLM03"],
      });
    }
  }

  return findings;
}
