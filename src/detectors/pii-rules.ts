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

export const PII_RULES: Rule[] = [
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
    id: "us_phone_number",
    name: "US Phone Number",
    pattern: /\b(?:\+?1[-.\s]?)?\(?[2-9]\d{2}\)?[-.\s]\d{3}[-.\s]\d{4}\b/g,
    severity: "medium",
    confidence: 0.75,
    explanation:
      "US phone number detected. May identify an individual customer or employee.",
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
  {
    id: "us_ssn",
    name: "US Social Security Number",
    pattern: /\b(?!000|666|9\d{2})\d{3}-(?!00)\d{2}-(?!0000)\d{4}\b/g,
    severity: "critical",
    confidence: 0.9,
    explanation:
      "US social security number detected. Sharing SSNs in prompts is a serious privacy and regulatory risk.",
  },
];
