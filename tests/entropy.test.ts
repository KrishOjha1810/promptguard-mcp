import { describe, it, expect } from "vitest";
import { shannonEntropy, findHighEntropyTokens, hashToken } from "../src/mcp-scan/entropy.js";
import { analyzeEvents, ingestTrace } from "../src/mcp-scan/recorder.js";

describe("shannonEntropy", () => {
  it("is 0 for a single repeated character and higher for random data", () => {
    expect(shannonEntropy("aaaaaa")).toBe(0);
    expect(shannonEntropy("aZ9$kQ2#mX")).toBeGreaterThan(3);
  });
});

describe("findHighEntropyTokens", () => {
  it("flags a high-entropy base64-like blob", () => {
    const blob = "kJ8fK2mN9pQ4rS7tU1vW3xY5zA6bC0dE8gH2jL4nP6q";
    const found = findHighEntropyTokens(`token=${blob}`);
    expect(found.length).toBeGreaterThan(0);
    expect(found[0].token).toBe(blob);
  });

  it("does not flag ordinary prose or short tokens", () => {
    const found = findHighEntropyTokens(
      "Please summarize this document about quarterly revenue projections.",
    );
    expect(found).toHaveLength(0);
  });

  it("respects the allowlist (suppresses a marked token)", () => {
    const blob = "kJ8fK2mN9pQ4rS7tU1vW3xY5zA6bC0dE8gH2jL4nP6q";
    const allowed = new Set([hashToken(blob)]);
    expect(findHighEntropyTokens(`token=${blob}`, { allowed })).toHaveLength(0);
  });
});

describe("entropy layer in the recorder", () => {
  function span(tool: string, args: string, result: string): string {
    return JSON.stringify({
      name: "execute_tool",
      attributes: {
        "gen_ai.operation.name": "execute_tool",
        "gen_ai.tool.name": tool,
        "gen_ai.tool.call.arguments": args,
        "gen_ai.tool.call.result": result,
      },
    });
  }

  it("is OFF by default (no entropy findings without the option)", () => {
    const blob = "kJ8fK2mN9pQ4rS7tU1vW3xY5zA6bC0dE8gH2jL4nP6q";
    const findings = analyzeEvents(ingestTrace(span("read", "{}", blob)));
    expect(findings.some((f) => f.ruleId === "high_entropy_token")).toBe(false);
  });

  it("flags an unknown high-entropy secret in a result when enabled", () => {
    const blob = "kJ8fK2mN9pQ4rS7tU1vW3xY5zA6bC0dE8gH2jL4nP6q";
    const findings = analyzeEvents(ingestTrace(span("read", "{}", blob)), { detectEntropy: true });
    const ent = findings.find((f) => f.ruleId === "high_entropy_token");
    expect(ent).toBeTruthy();
    expect(ent?.severity).toBe("medium");
  });
});
