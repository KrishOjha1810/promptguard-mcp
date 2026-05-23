import { SECRET_RULES } from "./rules.js";
import type { Finding, ScanResult } from "../types.js";

export function scanForSecrets(text: string): ScanResult {
  const start = performance.now();
  const findings: Finding[] = [];

  for (const rule of SECRET_RULES) {
    rule.pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = rule.pattern.exec(text)) !== null) {
      findings.push({
        type: rule.id,
        rule: rule.name,
        severity: rule.severity,
        start: match.index,
        end: match.index + match[0].length,
        matched: match[0],
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
    rulesRun: SECRET_RULES.length,
  };
}

function buildRedactedText(text: string, findings: Finding[]): string {
  if (findings.length === 0) return text;

  let result = text;
  const sorted = [...findings].sort((a, b) => b.start - a.start);
  for (const finding of sorted) {
    const marker = `[REDACTED:${finding.type}]`;
    result = result.slice(0, finding.start) + marker + result.slice(finding.end);
  }
  return result;
}
