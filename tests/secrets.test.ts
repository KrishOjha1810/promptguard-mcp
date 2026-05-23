import { describe, it, expect } from "vitest";
import { scanForSecrets } from "../src/detectors/secrets.js";

// Test fixtures. Each prefix is concatenated at runtime so no literal in this
// source file matches a complete credential pattern (avoids static scanners
// flagging the test data itself).
const FAKE = {
  awsAccessKey: "AKIA" + "IOSFODNN7EXAMPLE",
  githubPat: "ghp" + "_EXAMPLEFAKETESTKEYDONOTUSE0000000000",
  anthropicKey: "sk-ant-api" + "03-" + "A".repeat(93) + "AA",
  stripeLive: "sk_live" + "_EXAMPLEFAKETESTKEY000000",
  googleApi: "AIza" + "EXAMPLEFAKETESTKEY00000000000000000",
  pemHeader: "-----BEGIN RSA PRIVATE KEY-----",
  npmToken: "npm" + "_EXAMPLEFAKETESTKEYDONOTUSE0000000000",
};

describe("scanForSecrets", () => {
  it("returns no findings for clean text", () => {
    const result = scanForSecrets("This is a normal message with no secrets.");
    expect(result.findings).toHaveLength(0);
    expect(result.redactedText).toBe("This is a normal message with no secrets.");
  });

  it("detects an AWS access key id", () => {
    const result = scanForSecrets(`My key is ${FAKE.awsAccessKey} in the config.`);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].type).toBe("aws_access_key_id");
    expect(result.findings[0].matched).toBe(FAKE.awsAccessKey);
    expect(result.findings[0].severity).toBe("critical");
    expect(result.findings[0].explanation).toContain("AWS");
  });

  it("detects a GitHub classic personal access token", () => {
    const result = scanForSecrets(`token=${FAKE.githubPat}`);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].type).toBe("github_pat_classic");
    expect(result.findings[0].severity).toBe("critical");
  });

  it("detects an Anthropic API key", () => {
    const result = scanForSecrets(`ANTHROPIC_API_KEY=${FAKE.anthropicKey}`);
    expect(result.findings.some((f) => f.type === "anthropic_api_key")).toBe(true);
  });

  it("detects a Stripe live secret key", () => {
    const result = scanForSecrets(`STRIPE_SECRET=${FAKE.stripeLive}`);
    expect(result.findings.some((f) => f.type === "stripe_live_secret_key")).toBe(true);
  });

  it("detects a Google API key", () => {
    const result = scanForSecrets(`GOOGLE_API_KEY=${FAKE.googleApi}`);
    expect(result.findings.some((f) => f.type === "google_api_key")).toBe(true);
  });

  it("detects an npm access token", () => {
    const result = scanForSecrets(`NPM_TOKEN=${FAKE.npmToken}`);
    expect(result.findings.some((f) => f.type === "npm_access_token")).toBe(
      true,
    );
    expect(
      result.findings.find((f) => f.type === "npm_access_token")?.severity,
    ).toBe("critical");
  });

  it("detects a PEM private key header", () => {
    const result = scanForSecrets(`${FAKE.pemHeader}\nMIIEowIBAA...`);
    expect(result.findings.some((f) => f.type === "pem_private_key")).toBe(true);
  });

  it("detects multiple secrets in one prompt", () => {
    const result = scanForSecrets(`
      Check my .env:
      AWS_ACCESS_KEY=${FAKE.awsAccessKey}
      GITHUB_TOKEN=${FAKE.githubPat}
    `);
    expect(result.findings.length).toBeGreaterThanOrEqual(2);
    const types = result.findings.map((f) => f.type);
    expect(types).toContain("aws_access_key_id");
    expect(types).toContain("github_pat_classic");
  });

  it("redacts secrets in the output text when sorted by position", () => {
    const result = scanForSecrets(`Here is my key: ${FAKE.awsAccessKey} done.`);
    expect(result.redactedText).not.toContain(FAKE.awsAccessKey);
    expect(result.redactedText).toContain("[REDACTED:aws_access_key_id]");
  });

  it("sorts findings by start offset", () => {
    const result = scanForSecrets(`${FAKE.githubPat} and ${FAKE.awsAccessKey}`);
    for (let i = 1; i < result.findings.length; i++) {
      expect(result.findings[i].start).toBeGreaterThanOrEqual(
        result.findings[i - 1].start,
      );
    }
  });

  it("includes scan timing", () => {
    const result = scanForSecrets("normal text with no findings");
    expect(result.scanMs).toBeGreaterThanOrEqual(0);
    expect(result.rulesRun).toBeGreaterThan(0);
  });

  it("returns confidence and explanation for every finding", () => {
    const result = scanForSecrets(FAKE.awsAccessKey);
    for (const f of result.findings) {
      expect(f.confidence).toBeGreaterThan(0);
      expect(f.confidence).toBeLessThanOrEqual(1);
      expect(f.explanation.length).toBeGreaterThan(0);
    }
  });
});
