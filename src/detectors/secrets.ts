import { SECRET_RULES } from "./rules.js";
import { PII_RULES } from "./pii-rules.js";
import type { Finding, Rule, ScanResult } from "../types.js";

const ALL_RULES: Rule[] = [...SECRET_RULES, ...PII_RULES];

export function scanText(text: string): ScanResult {
  const start = performance.now();
  const findings: Finding[] = [];

  for (const rule of ALL_RULES) {
    rule.pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = rule.pattern.exec(text)) !== null) {
      const matched = match[0];
      if (rule.validator && !rule.validator(matched)) continue;
      findings.push({
        type: rule.id,
        rule: rule.name,
        severity: rule.severity,
        start: match.index,
        end: match.index + matched.length,
        matched,
        confidence: rule.confidence,
        explanation: rule.explanation,
      });
    }
  }

  findings.sort((a, b) => a.start - b.start);

  const redactedText = buildRedactedText(text, findings);

  return {
    findings,
    redactedText,
    scanMs: performance.now() - start,
    rulesRun: ALL_RULES.length,
  };
}

// Backwards-compatible alias. Older callers used this name.
export const scanForSecrets = scanText;

function buildRedactedText(text: string, findings: Finding[]): string {
  if (findings.length === 0) return text;

  let result = text;
  const sorted = [...findings].sort((a, b) => b.start - a.start);
  for (const finding of sorted) {
    const marker = `[REDACTED:${finding.type}]`;
    result =
      result.slice(0, finding.start) + marker + result.slice(finding.end);
  }
  return result;
}
