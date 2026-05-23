import { describe, it, expect } from "vitest";
import { scanText } from "../src/detectors/secrets.js";

// Test fixtures. Built at runtime so static scanners do not see complete
// secret-shaped strings in the source file. These are not real personal data.
const FAKE = {
  email: "alice" + "@example.com",
  phoneDashed: "415-555-0123",
  phoneParen: "(415) 555-0123",
  // Famous test card that passes Luhn. Split so it never appears as a literal
  // contiguous run in this source.
  validCardSpaced: "4242" + " 4242 4242 4242",
  invalidCard: "1234" + " 5678 9012 3456",
  validSsn: "123-45-6789",
  reservedSsn: "000-12-3456",
};

describe("scanText - PII detection", () => {
  it("detects an email address", () => {
    const result = scanText(`Contact ${FAKE.email} for follow-up.`);
    expect(result.findings.some((f) => f.type === "email_address")).toBe(true);
  });

  it("detects a US phone number with dashes", () => {
    const result = scanText(`Call ${FAKE.phoneDashed} for support.`);
    expect(result.findings.some((f) => f.type === "us_phone_number")).toBe(true);
  });

  it("detects a US phone number with parentheses", () => {
    const result = scanText(`My number is ${FAKE.phoneParen}.`);
    expect(result.findings.some((f) => f.type === "us_phone_number")).toBe(true);
  });

  it("detects a Luhn-valid credit card number", () => {
    const result = scanText(`Card: ${FAKE.validCardSpaced}`);
    expect(result.findings.some((f) => f.type === "credit_card")).toBe(true);
  });

  it("does not flag a Luhn-invalid digit sequence as a credit card", () => {
    const result = scanText(`Not a card: ${FAKE.invalidCard}`);
    expect(result.findings.some((f) => f.type === "credit_card")).toBe(false);
  });

  it("detects a US SSN", () => {
    const result = scanText(`SSN: ${FAKE.validSsn}`);
    expect(result.findings.some((f) => f.type === "us_ssn")).toBe(true);
  });

  it("does not flag a reserved SSN area number", () => {
    // 000-XX-XXXX is reserved and never issued, so the regex must exclude it.
    const result = scanText(`SSN: ${FAKE.reservedSsn}`);
    expect(result.findings.some((f) => f.type === "us_ssn")).toBe(false);
  });

  it("flags a critical credit-card finding with high confidence", () => {
    const result = scanText(`Card: ${FAKE.validCardSpaced}`);
    const cardFinding = result.findings.find((f) => f.type === "credit_card");
    expect(cardFinding).toBeDefined();
    expect(cardFinding?.severity).toBe("critical");
    expect(cardFinding?.confidence).toBeGreaterThanOrEqual(0.8);
  });
});
