export type Severity = "low" | "medium" | "high" | "critical";

export type Rule = {
  id: string;
  name: string;
  pattern: RegExp;
  severity: Severity;
  confidence: number;
  explanation: string;
  /**
   * Optional post-match validator. When present, a regex match is only emitted
   * as a finding if this returns true. Used for example for Luhn validation on
   * credit card numbers.
   */
  validator?: (matched: string) => boolean;
};

export type Finding = {
  type: string;
  rule: string;
  severity: Severity;
  start: number;
  end: number;
  matched: string;
  confidence: number;
  explanation: string;
};

export type ScanResult = {
  findings: Finding[];
  redactedText: string;
  scanMs: number;
  rulesRun: number;
};
