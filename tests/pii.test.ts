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

  // Regression: long numeric IDs (tweet/snowflake IDs) are 13-19 digits and a
  // chunk of them pass Luhn by chance. They start "20..." and match no card
  // network IIN, so the issuer-prefix gate must reject them all.
  it("does not flag long Twitter/snowflake IDs as credit cards", () => {
    const ids = [
      "2062204362102100295",
      "2064650839055052823",
      "2065597942602531163",
      "2065955248288542963",
      "2068861630327443966",
      "2069468693017268244",
    ];
    const result = scanText(
      `Links: ${ids.map((id) => `https://x.com/i/status/${id}`).join(" ")}`,
    );
    expect(result.findings.some((f) => f.type === "credit_card")).toBe(false);
  });

  it("still detects real cards across major networks", () => {
    // Built at runtime so no contiguous PAN appears as a literal in source.
    const cards = {
      visa: "4242" + "424242424242", // 16
      mastercard: "5555" + "555555554444", // 16
      amex: "3782" + "822463100050".slice(0, 11), // 15: 378282246310005
      discover: "6011" + "111111111117", // 16
    };
    for (const [network, pan] of Object.entries(cards)) {
      const result = scanText(`${network} card: ${pan}`);
      expect(result.findings.some((f) => f.type === "credit_card")).toBe(true);
    }
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
