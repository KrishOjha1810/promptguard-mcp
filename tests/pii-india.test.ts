import { describe, it, expect } from "vitest";
import { scanText } from "../src/detectors/secrets.js";
import { verhoeffCheck } from "../src/detectors/pii-rules.js";

// Builds a Verhoeff-valid 12-digit Aadhaar from an 11-digit prefix by brute
// forcing the final digit. Used so tests do not hardcode magic numbers.
function makeValidAadhaar(prefix11: string): string {
  if (prefix11.length !== 11 || !/^[2-9]\d{10}$/.test(prefix11)) {
    throw new Error("prefix11 must be 11 digits starting 2-9");
  }
  for (let d = 0; d < 10; d++) {
    const candidate = prefix11 + d.toString();
    if (verhoeffCheck(candidate)) return candidate;
  }
  throw new Error("no valid Aadhaar checksum digit found");
}

const FAKE = {
  mobilePlain: "9876543210",
  mobileSplit: "+91 98765 43210",
  mobileHyphen: "98765-43210",
  // Real format Aadhaar with valid Verhoeff checksum, built at runtime.
  aadhaar: makeValidAadhaar("23456789012"),
  // Aadhaar-shaped but Verhoeff-invalid (last digit changed).
  aadhaarBadChecksum: "234567890121",
  pan: "ABCDE1234F",
  gstin: "27AAAAA0000A1Z5",
  upi: "alice" + "@paytm",
  ifsc: "HDFC0001234",
};

describe("scanText - Indian PII detection", () => {
  it("detects a plain 10-digit Indian mobile number", () => {
    const result = scanText(`Call me on ${FAKE.mobilePlain} please.`);
    expect(result.findings.some((f) => f.type === "india_mobile_number")).toBe(true);
  });

  it("detects an Indian mobile number with +91 prefix and split format", () => {
    const result = scanText(`Reach me at ${FAKE.mobileSplit}.`);
    expect(result.findings.some((f) => f.type === "india_mobile_number")).toBe(true);
  });

  it("detects an Indian mobile number with internal hyphen", () => {
    const result = scanText(`My number is ${FAKE.mobileHyphen}.`);
    expect(result.findings.some((f) => f.type === "india_mobile_number")).toBe(true);
  });

  it("detects a Verhoeff-valid Aadhaar number", () => {
    const result = scanText(`Aadhaar: ${FAKE.aadhaar}`);
    const aadhaarFinding = result.findings.find((f) => f.type === "india_aadhaar");
    expect(aadhaarFinding).toBeDefined();
    expect(aadhaarFinding?.severity).toBe("critical");
  });

  it("does not flag an Aadhaar-shaped number with an invalid checksum", () => {
    const result = scanText(`Bad aadhaar: ${FAKE.aadhaarBadChecksum}`);
    expect(result.findings.some((f) => f.type === "india_aadhaar")).toBe(false);
  });

  it("detects a PAN", () => {
    const result = scanText(`PAN: ${FAKE.pan}`);
    expect(result.findings.some((f) => f.type === "india_pan")).toBe(true);
  });

  it("detects a GSTIN", () => {
    const result = scanText(`GSTIN: ${FAKE.gstin}`);
    expect(result.findings.some((f) => f.type === "india_gstin")).toBe(true);
  });

  it("detects a UPI ID and does not confuse it with an email", () => {
    const result = scanText(`UPI: ${FAKE.upi}`);
    expect(result.findings.some((f) => f.type === "india_upi_id")).toBe(true);
    expect(result.findings.some((f) => f.type === "email_address")).toBe(false);
  });

  it("does not flag an email address as a UPI ID", () => {
    const result = scanText("Contact alice@example.com for support.");
    expect(result.findings.some((f) => f.type === "email_address")).toBe(true);
    expect(result.findings.some((f) => f.type === "india_upi_id")).toBe(false);
  });

  it("detects an IFSC code", () => {
    const result = scanText(`IFSC: ${FAKE.ifsc}`);
    expect(result.findings.some((f) => f.type === "india_ifsc")).toBe(true);
  });

  describe("verhoeffCheck helper", () => {
    it("accepts a valid 12-digit number", () => {
      expect(verhoeffCheck(FAKE.aadhaar)).toBe(true);
    });
    it("rejects wrong length", () => {
      expect(verhoeffCheck("12345")).toBe(false);
      expect(verhoeffCheck("1234567890123")).toBe(false);
    });
    it("rejects non-digit characters", () => {
      expect(verhoeffCheck("23456789012A")).toBe(false);
    });
    it("rejects numbers starting with 0 or 1", () => {
      expect(verhoeffCheck("123456789012")).toBe(false);
      expect(verhoeffCheck("034567890123")).toBe(false);
    });
  });
});
