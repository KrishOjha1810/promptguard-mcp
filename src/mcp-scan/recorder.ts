import { createHash } from "node:crypto";
import { scanText } from "../detectors/secrets.js";
import { jcsCanonicalize } from "./pinning.js";
import type { McpFinding } from "./types.js";
import type { Severity } from "../types.js";

// ---------------------------------------------------------------------------
// Flight recorder: read the OpenTelemetry tool-call spans an agent emits,
// scan their arguments AND results locally, detect cross-call toxic flows, and
// write a tamper-evident IETF-AAT-style hash-chained JSONL audit log. Zero
// network: we only read spans the agent already produced.
// ---------------------------------------------------------------------------

export type ToolCallEvent = {
  index: number;
  timestamp: string; // ISO; best-effort
  toolName: string;
  server: string | null;
  argumentsText: string;
  resultText: string;
  outcome: string;
};

// Suspicious data sinks: ephemeral request collectors and tunnels that have no
// legitimate reason to receive an agent's data.
const SUSPICIOUS_SINKS = [
  "webhook.site",
  "requestbin",
  "pipedream.net",
  "ngrok.io",
  "ngrok-free.app",
  "burpcollaborator",
  "oast.fun",
  "oast.site",
  "interact.sh",
  "requestcatcher.com",
];

const URL_RE = /\bhttps?:\/\/([a-z0-9.-]+|\d{1,3}(?:\.\d{1,3}){3})(?::\d+)?[^\s"'`]*/gi;
const RAW_IP_HOST_RE = /^\d{1,3}(?:\.\d{1,3}){3}$/;
const SENSITIVE_SOURCE_RE =
  /(\.env\b|\.ssh\b|id_rsa|id_ed25519|\/etc\/passwd|credentials?|secret|private[_\s-]?key|api[_\s-]?key|password|token)/i;
const SEND_TOOL_RE = /(send|post|upload|fetch|http|email|webhook|put|request|publish|push|export|transmit)/i;

function sev(n: number): Severity {
  return (["low", "medium", "high", "critical"] as Severity[])[Math.max(0, Math.min(3, n))];
}

// Pull the attribute value out of either a flat object ({k: v}) or the OTLP
// array shape ([{key, value:{stringValue|intValue|...}}]). This is the mapping
// layer that insulates us from convention churn.
function attr(span: Record<string, unknown>, key: string): string | undefined {
  const a = span.attributes;
  if (a && typeof a === "object" && !Array.isArray(a)) {
    const v = (a as Record<string, unknown>)[key];
    if (v !== undefined && v !== null) return typeof v === "string" ? v : JSON.stringify(v);
  }
  if (Array.isArray(a)) {
    for (const item of a) {
      if (item && typeof item === "object" && (item as { key?: string }).key === key) {
        const val = (item as { value?: Record<string, unknown> }).value ?? {};
        const inner =
          val.stringValue ?? val.intValue ?? val.boolValue ?? val.doubleValue ?? val.value;
        if (inner !== undefined) return typeof inner === "string" ? inner : JSON.stringify(inner);
      }
    }
  }
  return undefined;
}

function isToolCallSpan(span: Record<string, unknown>): boolean {
  const op = attr(span, "gen_ai.operation.name");
  const method = attr(span, "mcp.method.name");
  const name = typeof span.name === "string" ? span.name : "";
  return (
    op === "execute_tool" ||
    method === "tools/call" ||
    /execute_tool|tools\/call|tool\.call/i.test(name)
  );
}

export function ingestTrace(text: string): ToolCallEvent[] {
  const events: ToolCallEvent[] = [];
  let idx = 0;
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let span: Record<string, unknown>;
    try {
      span = JSON.parse(trimmed);
    } catch {
      continue;
    }
    if (!isToolCallSpan(span)) continue;
    const toolName =
      attr(span, "gen_ai.tool.name") ??
      attr(span, "tool.name") ??
      (typeof span.name === "string" ? span.name : "unknown");
    const argumentsText =
      attr(span, "gen_ai.tool.call.arguments") ?? attr(span, "tool.arguments") ?? "";
    const resultText =
      attr(span, "gen_ai.tool.call.result") ?? attr(span, "tool.result") ?? "";
    const server = attr(span, "mcp.session.id") ?? attr(span, "server.address") ?? null;
    const ts =
      (typeof span.timestamp === "string" && span.timestamp) ||
      attr(span, "timestamp") ||
      "";
    events.push({
      index: idx++,
      timestamp: ts || "(unknown)",
      toolName,
      server,
      argumentsText,
      resultText,
      outcome: attr(span, "outcome") ?? "ok",
    });
  }
  return events;
}

function extractDomains(text: string): { domain: string; raw: string }[] {
  const out: { domain: string; raw: string }[] = [];
  let m: RegExpExecArray | null;
  URL_RE.lastIndex = 0;
  while ((m = URL_RE.exec(text)) !== null) out.push({ domain: m[1].toLowerCase(), raw: m[0] });
  return out;
}

function isExternalSink(domain: string): boolean {
  if (RAW_IP_HOST_RE.test(domain)) return true;
  return SUSPICIOUS_SINKS.some((s) => domain.includes(s));
}

export type RecorderResult = {
  events: ToolCallEvent[];
  findings: McpFinding[];
};

export function analyzeEvents(events: ToolCallEvent[]): McpFinding[] {
  const findings: McpFinding[] = [];

  // Per-event: secrets in arguments and results, suspicious sink domains.
  const sawSensitiveReadBefore: { index: number; what: string }[] = [];
  for (const ev of events) {
    const loc = `tool_call[${ev.index}] ${ev.toolName}`;

    for (const [field, txt] of [
      ["arguments", ev.argumentsText],
      ["result", ev.resultText],
    ] as const) {
      if (!txt) continue;
      const res = scanText(txt);
      for (const f of res.findings) {
        findings.push({
          category: field === "result" ? "secret_in_result" : "secret_in_config",
          ruleId: f.type,
          title: `Secret in tool ${field}: ${f.rule}`,
          severity: f.severity,
          confidence: f.confidence,
          location: `${loc}.${field}`,
          evidence: f.matched.length > 40 ? f.matched.slice(0, 40) + "..." : f.matched,
          explanation:
            f.explanation +
            (field === "result"
              ? " Appeared in a tool RESULT at runtime, which a pre-install static scan cannot see."
              : " Passed as a tool-call argument at runtime."),
          owasp: ["LLM06", "T2"],
        });
      }
      // suspicious sink domains
      for (const { domain, raw } of extractDomains(txt)) {
        if (isExternalSink(domain)) {
          findings.push({
            category: "exfil_domain",
            ruleId: "suspicious_sink",
            title: `Suspicious data sink: ${domain}`,
            severity: "high",
            confidence: 0.8,
            location: `${loc}.${field}`,
            evidence: raw.length > 50 ? raw.slice(0, 50) + "..." : raw,
            explanation:
              "A tool call referenced an ephemeral request collector, tunnel, or raw IP, the kind of endpoint used to exfiltrate data. Confirm this destination is intended.",
            owasp: ["LLM06", "T2"],
          });
        }
      }
    }

    // Track sensitive reads for cross-call toxic-flow detection.
    const readsSensitive =
      SENSITIVE_SOURCE_RE.test(ev.toolName) ||
      SENSITIVE_SOURCE_RE.test(ev.argumentsText) ||
      scanText(ev.resultText).findings.length > 0;
    if (readsSensitive) {
      sawSensitiveReadBefore.push({ index: ev.index, what: ev.toolName });
    }

    // If THIS call sends externally and a sensitive read happened earlier, that
    // is a toxic flow: read-secret then send-out. Static scanners cannot see
    // this because it spans multiple calls.
    const sendsExternal =
      SEND_TOOL_RE.test(ev.toolName) &&
      [...extractDomains(ev.argumentsText), ...extractDomains(ev.resultText)].length > 0;
    const priorRead = sawSensitiveReadBefore.find((r) => r.index < ev.index);
    if (sendsExternal && priorRead) {
      const domains = extractDomains(ev.argumentsText).map((d) => d.domain);
      findings.push({
        category: "toxic_flow",
        ruleId: "read_then_exfiltrate",
        title: `Toxic flow: sensitive read then external send`,
        severity: "critical",
        confidence: 0.7,
        location: `tool_call[${priorRead.index}] ${priorRead.what} -> tool_call[${ev.index}] ${ev.toolName}`,
        evidence: `${priorRead.what} (sensitive) then ${ev.toolName} to ${domains.join(", ") || "external"}`,
        explanation:
          "A tool that touched sensitive data was followed by a tool that sends data to an external destination. This read-then-exfiltrate sequence is a classic agent data-leak, and it can only be seen by watching tool calls across the whole session, not one at a time.",
        owasp: ["LLM06", "T2"],
      });
    }
  }

  return findings;
}

export function recordTrace(text: string): RecorderResult {
  const events = ingestTrace(text);
  return { events, findings: analyzeEvents(events) };
}

// ---------------------------------------------------------------------------
// Tamper-evident audit log (hash-chained JSONL), aligned with the IETF Agent
// Audit Trail draft (draft-sharif-agent-audit-trail-00). That draft is early
// and will change, so this is "aligned with draft-00", not "conformant", and
// the record shape is intentionally easy to version. The hash chain makes
// tampering EVIDENT (verify breaks at the edited line); it is not tamper-PROOF
// against a local attacker who can rewrite from genesis. Optional signing and
// external anchoring are the roadmap for that.
// ---------------------------------------------------------------------------

export type AatRecord = {
  record_id: string;
  timestamp: string;
  agent_id: string;
  agent_version: string;
  session_id: string;
  action_type: string; // "tool_call" | "session_start" | "session_close"
  action_detail: Record<string, unknown>;
  outcome: string;
  trust_level: "L0" | "L1" | "L2" | "L3" | "L4";
  parent_record_id: string | null;
  prev_hash: string | null;
};

function hashRecord(rec: AatRecord): string {
  return "sha256:" + createHash("sha256").update(jcsCanonicalize(rec)).digest("hex");
}

function paramsHash(argsText: string): string {
  return "sha256:" + createHash("sha256").update(argsText).digest("hex");
}

// Map the worst finding on an event to an AAT trust level (L4 trusted .. L0 untrusted).
function trustLevel(findingsForEvent: McpFinding[]): AatRecord["trust_level"] {
  if (findingsForEvent.some((f) => f.severity === "critical")) return "L0";
  if (findingsForEvent.some((f) => f.severity === "high")) return "L1";
  if (findingsForEvent.some((f) => f.severity === "medium")) return "L2";
  if (findingsForEvent.length > 0) return "L3";
  return "L4";
}

export function buildAuditLog(
  result: RecorderResult,
  meta: { agentId: string; agentVersion: string; sessionId: string },
): AatRecord[] {
  const records: AatRecord[] = [];
  let prevHash: string | null = null;
  let n = 0;

  const push = (
    action_type: string,
    action_detail: Record<string, unknown>,
    trust: AatRecord["trust_level"],
    outcome: string,
    ts: string,
  ) => {
    const rec: AatRecord = {
      record_id: `${meta.sessionId}-${n}`,
      timestamp: ts,
      agent_id: meta.agentId,
      agent_version: meta.agentVersion,
      session_id: meta.sessionId,
      action_type,
      action_detail,
      outcome,
      trust_level: trust,
      parent_record_id: n === 0 ? null : `${meta.sessionId}-${n - 1}`,
      prev_hash: prevHash,
    };
    records.push(rec);
    prevHash = hashRecord(rec);
    n++;
  };

  // Genesis.
  push("session_start", { tool: "promptguard-recorder" }, "L4", "ok", "(session start)");

  for (const ev of result.events) {
    const evFindings = result.findings.filter((f) => f.location.includes(`tool_call[${ev.index}]`));
    push(
      "tool_call",
      {
        tool_name: ev.toolName,
        tool_server: ev.server,
        parameters_hash: paramsHash(ev.argumentsText),
        flagged: evFindings.length > 0,
        finding_rule_ids: evFindings.map((f) => f.ruleId),
      },
      trustLevel(evFindings),
      ev.outcome,
      ev.timestamp,
    );
  }

  // Session close with a summary hash over the chain.
  const sessionHash =
    "sha256:" +
    createHash("sha256")
      .update(records.map((r) => hashRecord(r)).join("") + records.length)
      .digest("hex");
  push(
    "session_close",
    { records: records.length, findings: result.findings.length, session_hash: sessionHash },
    result.findings.some((f) => f.severity === "critical") ? "L0" : "L4",
    "ok",
    "(session close)",
  );

  return records;
}

export function serializeLog(records: AatRecord[]): string {
  return records.map((r) => JSON.stringify(r)).join("\n") + "\n";
}

// Re-walk a hash-chained log; return the first broken link, or null if intact.
export function verifyLog(text: string): { ok: boolean; brokenAt?: number; reason?: string } {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  let prevHash: string | null = null;
  for (let i = 0; i < lines.length; i++) {
    let rec: AatRecord;
    try {
      rec = JSON.parse(lines[i]);
    } catch {
      return { ok: false, brokenAt: i, reason: "record is not valid JSON" };
    }
    if (rec.prev_hash !== prevHash) {
      return {
        ok: false,
        brokenAt: i,
        reason: `prev_hash mismatch (a record was inserted, removed, or edited at or before line ${i})`,
      };
    }
    prevHash = hashRecord(rec);
  }
  return { ok: true };
}

// A simplified EU AI Act Article 12-shaped export: the operation-level record
// of events over the session that a deployer could retain for audit.
export function exportArticle12(
  result: RecorderResult,
  meta: { agentId: string; agentVersion: string; sessionId: string },
): object {
  return {
    standard: "EU AI Act Article 12 (record-keeping), operation-level event log",
    note: "Local export from PromptGuard. Retain per Article 19/26 (minimum 6 months).",
    agent_id: meta.agentId,
    agent_version: meta.agentVersion,
    session_id: meta.sessionId,
    total_tool_calls: result.events.length,
    total_findings: result.findings.length,
    events: result.events.map((ev) => ({
      index: ev.index,
      timestamp: ev.timestamp,
      tool_name: ev.toolName,
      tool_server: ev.server,
      outcome: ev.outcome,
      flagged_rule_ids: result.findings
        .filter((f) => f.location.includes(`tool_call[${ev.index}]`))
        .map((f) => f.ruleId),
    })),
  };
}
