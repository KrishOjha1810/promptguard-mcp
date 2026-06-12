import type { McpFinding, McpScanResult } from "./types.js";
import type { Severity } from "../types.js";

// Map our severity to SARIF result levels.
function sarifLevel(sev: Severity): "error" | "warning" | "note" {
  if (sev === "critical" || sev === "high") return "error";
  if (sev === "medium") return "warning";
  return "note";
}

// Produce a minimal but valid SARIF 2.1.0 log so the scan drops into GitHub
// code scanning and other SARIF consumers. No account or upload required; this
// is just a file format.
export function toSarif(result: McpScanResult, artifactUri: string): object {
  const ruleIds = Array.from(new Set(result.findings.map((f) => f.ruleId)));
  const rules = ruleIds.map((id) => {
    const f = result.findings.find((x) => x.ruleId === id) as McpFinding;
    return {
      id,
      name: f.title,
      shortDescription: { text: f.title },
      fullDescription: { text: f.explanation },
      properties: { owasp: f.owasp, category: f.category },
    };
  });

  const results = result.findings.map((f) => ({
    ruleId: f.ruleId,
    level: sarifLevel(f.severity),
    message: {
      text: `${f.title} at ${f.location}: ${f.explanation} (evidence: ${f.evidence})`,
    },
    locations: [
      {
        physicalLocation: {
          artifactLocation: { uri: artifactUri },
        },
        logicalLocations: [{ fullyQualifiedName: f.location }],
      },
    ],
    properties: {
      severity: f.severity,
      confidence: f.confidence,
      owasp: f.owasp,
      category: f.category,
    },
  }));

  return {
    $schema:
      "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json",
    version: "2.1.0",
    runs: [
      {
        tool: {
          driver: {
            name: "PromptGuard scan-mcp",
            informationUri: "https://github.com/KrishOjha1810/promptguard-mcp",
            rules,
          },
        },
        results,
      },
    ],
  };
}
