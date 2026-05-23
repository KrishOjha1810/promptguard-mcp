import type { Rule } from "../types.js";

export function luhnCheck(input: string): boolean {
  const digits = input.replace(/[\s-]/g, "");
  if (digits.length < 13 || digits.length > 19) return false;
  if (!/^\d+$/.test(digits)) return false;

  let sum = 0;
  let alternate = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = parseInt(digits[i], 10);
    if (alternate) {
      n *= 2;
      if (n > 9) n = (n % 10) + 1;
    }
    sum += n;
    alternate = !alternate;
  }
  return sum % 10 === 0;
}

// Verhoeff checksum algorithm. Used by Aadhaar numbers to detect typos.
const VERHOEFF_D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];

const VERHOEFF_P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];

export function verhoeffCheck(input: string): boolean {
  const digits = input.replace(/[\s-]/g, "");
  if (digits.length !== 12) return false;
  if (!/^[2-9]\d{11}$/.test(digits)) return false;

  let c = 0;
  const reversed = digits.split("").reverse();
  for (let i = 0; i < reversed.length; i++) {
    const digit = parseInt(reversed[i], 10);
    c = VERHOEFF_D[c][VERHOEFF_P[i % 8][digit]];
  }
  return c === 0;
}

export const PII_RULES: Rule[] = [
  // --------------------------------------------------------------------
  // Universal PII
  // --------------------------------------------------------------------
  {
    id: "email_address",
    name: "Email Address",
    pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
    severity: "medium",
    confidence: 0.85,
    explanation:
      "Email address detected. Sharing real user or customer emails in prompts is a privacy risk.",
  },
  {
    id: "credit_card",
    name: "Credit Card Number",
    pattern: /\b(?:\d[ -]?){13,19}\b/g,
    severity: "critical",
    confidence: 0.9,
    explanation:
      "Credit card number (Luhn-validated). Sharing card numbers in prompts violates PCI compliance and exposes the cardholder.",
    validator: luhnCheck,
  },

  // --------------------------------------------------------------------
  // US-specific PII
  // --------------------------------------------------------------------
  {
    id: "us_phone_number",
    name: "US Phone Number",
    pattern: /\b(?:\+?1[-.\s]?)?\(?[2-9]\d{2}\)?[-.\s]\d{3}[-.\s]\d{4}\b/g,
    severity: "medium",
    confidence: 0.75,
    explanation:
      "US phone number detected. May identify an individual customer or employee.",
  },
  {
    id: "us_ssn",
    name: "US Social Security Number",
    pattern: /\b(?!000|666|9\d{2})\d{3}-(?!00)\d{2}-(?!0000)\d{4}\b/g,
    severity: "critical",
    confidence: 0.9,
    explanation:
      "US social security number detected. Sharing SSNs in prompts is a serious privacy and regulatory risk.",
  },

  // --------------------------------------------------------------------
  // India-specific PII
  // --------------------------------------------------------------------
  {
    id: "india_mobile_number",
    name: "Indian Mobile Number",
    // 10-digit number starting 6-9, optionally prefixed with +91 / 91 / 0,
    // optionally split as 5+5 with a hyphen or space.
    pattern:
      /\b(?:(?:\+|00)?91[-.\s]?)?[6-9]\d{4}[-.\s]?\d{5}\b/g,
    severity: "medium",
    confidence: 0.75,
    explanation:
      "Indian mobile number detected. May identify an individual customer or employee.",
  },
  {
    id: "india_aadhaar",
    name: "Aadhaar Number",
    // 12 digits starting 2-9, optionally split as 4-4-4 with spaces or hyphens.
    // Verhoeff checksum applied as a validator below.
    pattern: /\b[2-9]\d{3}[-\s]?\d{4}[-\s]?\d{4}\b/g,
    severity: "critical",
    confidence: 0.95,
    explanation:
      "Aadhaar number (Verhoeff-validated). Sharing Aadhaar is a serious privacy and regulatory risk under Indian data protection law.",
    validator: verhoeffCheck,
  },
  {
    id: "india_pan",
    name: "Indian PAN (Permanent Account Number)",
    // 5 letters + 4 digits + 1 letter (e.g. ABCDE1234F).
    pattern: /\b[A-Z]{5}\d{4}[A-Z]\b/g,
    severity: "high",
    confidence: 0.85,
    explanation:
      "Indian PAN detected. The PAN is the primary tax identifier in India and should not appear in prompts.",
  },
  {
    id: "india_gstin",
    name: "Indian GSTIN",
    // 2 digit state code + 10 char PAN + entity digit + Z + checksum char.
    pattern: /\b\d{2}[A-Z]{5}\d{4}[A-Z]\dZ[0-9A-Z]\b/g,
    severity: "medium",
    confidence: 0.9,
    explanation:
      "Indian GSTIN detected. While less sensitive than PAN, this can link a business or proprietor to filings.",
  },
  {
    id: "india_upi_id",
    name: "Indian UPI ID",
    // username@handle where the handle has no dot, distinguishing it from email.
    pattern: /\b[A-Za-z0-9._-]+@[a-z]{2,20}\b(?!\.)/g,
    severity: "high",
    confidence: 0.85,
    explanation:
      "Indian UPI ID detected. UPI handles link directly to bank accounts and payment flows.",
  },
  {
    id: "india_ifsc",
    name: "Indian IFSC Code",
    // 4 letters (bank code) + '0' + 6 alphanumeric (branch code).
    pattern: /\b[A-Z]{4}0[A-Z0-9]{6}\b/g,
    severity: "medium",
    confidence: 0.9,
    explanation:
      "Indian IFSC code detected. Identifies a specific bank branch, sensitive when combined with an account number.",
  },
];
