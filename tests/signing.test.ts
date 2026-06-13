import { describe, it, expect } from "vitest";
import {
  generateKeypair,
  signData,
  verifyData,
  makeAnchor,
  parseAnchorToken,
} from "../src/mcp-scan/signing.js";
import {
  recordTrace,
  buildAuditLog,
  serializeLog,
  verifyLog,
  computeAnchor,
} from "../src/mcp-scan/recorder.js";

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

const trace = [
  flatSpan("get_weather", '{"city":"Pune"}', "{}"),
  flatSpan("save_note", '{"text":"hi"}', "{}"),
].join("\n");
const meta = { agentId: "a", agentVersion: "1", sessionId: "s" };

describe("Ed25519 signing primitives", () => {
  it("signs and verifies, and rejects a wrong key or altered data", () => {
    const kp = generateKeypair();
    const other = generateKeypair();
    const sig = signData("hello", kp.privateKeyPem);
    expect(verifyData("hello", sig, kp.publicKeyPem)).toBe(true);
    expect(verifyData("hello!", sig, kp.publicKeyPem)).toBe(false);
    expect(verifyData("hello", sig, other.publicKeyPem)).toBe(false);
  });

  it("derives a stable fingerprint", () => {
    const kp = generateKeypair();
    expect(kp.fingerprint).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe("signed audit log", () => {
  it("verifies a signed chain with the matching key", () => {
    const kp = generateKeypair();
    const log = buildAuditLog(recordTrace(trace), meta, {
      privateKeyPem: kp.privateKeyPem,
      fingerprint: kp.fingerprint,
    });
    const text = serializeLog(log);
    const res = verifyLog(text, { publicKeyPem: kp.publicKeyPem });
    expect(res.ok).toBe(true);
    expect(res.signaturesChecked).toBe(log.length);
  });

  it("rejects a forged record even if the chain hash is fixed up (no key to re-sign)", () => {
    const kp = generateKeypair();
    const log = buildAuditLog(recordTrace(trace), meta, {
      privateKeyPem: kp.privateKeyPem,
      fingerprint: kp.fingerprint,
    });
    const lines = serializeLog(log).trim().split("\n");
    // Attacker edits a record's content but cannot produce a valid signature.
    const rec = JSON.parse(lines[1]);
    rec.action_detail.tool_name = "totally_safe";
    lines[1] = JSON.stringify(rec);
    const res = verifyLog(lines.join("\n") + "\n", { publicKeyPem: kp.publicKeyPem });
    expect(res.ok).toBe(false);
  });

  it("an unsigned log fails verification when a key is required", () => {
    const kp = generateKeypair();
    const text = serializeLog(buildAuditLog(recordTrace(trace), meta)); // unsigned
    expect(verifyLog(text, { publicKeyPem: kp.publicKeyPem }).ok).toBe(false);
  });
});

describe("anchoring", () => {
  it("anchor token round-trips and matches an intact log", () => {
    const text = serializeLog(buildAuditLog(recordTrace(trace), meta));
    const anchor = computeAnchor(text);
    const parsed = parseAnchorToken(anchor.token)!;
    expect(parsed.headHash).toBe(anchor.headHash);
    expect(parsed.recordCount).toBe(anchor.recordCount);
    const res = verifyLog(text, { anchor: { recordCount: parsed.recordCount, headHash: parsed.headHash } });
    expect(res.ok).toBe(true);
  });

  it("detects a rewrite that keeps the chain internally consistent but changes the head", () => {
    const text = serializeLog(buildAuditLog(recordTrace(trace), meta));
    const anchor = computeAnchor(text);
    // Rebuild a DIFFERENT log (attacker with the ability to recompute the whole
    // chain) and check it no longer matches the previously recorded anchor.
    const rewritten = serializeLog(
      buildAuditLog(recordTrace(flatSpan("only_one", "{}", "{}")), meta),
    );
    const res = verifyLog(rewritten, {
      anchor: { recordCount: anchor.recordCount, headHash: anchor.headHash },
    });
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/anchor/i);
  });

  it("makeAnchor builds a parseable token", () => {
    const a = makeAnchor("sha256:abc", 3, "deadbeef");
    expect(parseAnchorToken(a.token)).toEqual({
      recordCount: 3,
      fingerprint: "deadbeef",
      headHash: "sha256:abc",
    });
  });
});
