import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { scanMcp } from "./scanner.js";
import { buildLock, diffAgainstLock } from "./pinning.js";
import type { McpDocument, McpFinding } from "./types.js";
import type { Severity } from "../types.js";

export type BenchCase = {
  id: string;
  title: string;
  provenance?: string;
  malicious: boolean;
  expect?: { category?: string; ruleId?: string };
  pin?: McpDocument;
  doc: McpDocument;
};

export type Corpus = { about?: string; version?: number; cases: BenchCase[] };

export type CaseResult = {
  id: string;
  title: string;
  malicious: boolean;
  pass: boolean;
  reason: string;
};

export type BenchReport = {
  total: number;
  malicious: number;
  benign: number;
  detected: number;
  falsePositives: number;
  recall: number;
  caseResults: CaseResult[];
};

const SEV_RANK: Record<Severity, number> = { low: 1, medium: 2, high: 3, critical: 4 };

function findingsFor(c: BenchCase): McpFinding[] {
  const res = scanMcp(JSON.stringify(c.doc));
  const findings = [...res.findings];
  if (c.pin) {
    findings.push(...diffAgainstLock(c.doc, buildLock(c.pin)));
  }
  return findings;
}

function matchesExpect(findings: McpFinding[], expect?: BenchCase["expect"]): boolean {
  if (!expect) return findings.some((f) => SEV_RANK[f.severity] >= SEV_RANK.high);
  return findings.some(
    (f) =>
      (!expect.category || f.category === expect.category) &&
      (!expect.ruleId || f.ruleId === expect.ruleId),
  );
}

export function runBenchmark(corpus: Corpus): BenchReport {
  const caseResults: CaseResult[] = [];
  let detected = 0;
  let falsePositives = 0;
  const maliciousCases = corpus.cases.filter((c) => c.malicious);
  const benignCases = corpus.cases.filter((c) => !c.malicious);

  for (const c of corpus.cases) {
    const findings = findingsFor(c);
    if (c.malicious) {
      const ok = matchesExpect(findings, c.expect);
      if (ok) detected++;
      caseResults.push({
        id: c.id,
        title: c.title,
        malicious: true,
        pass: ok,
        reason: ok
          ? "detected"
          : `MISS: expected ${JSON.stringify(c.expect ?? "high+")}, got [${findings.map((f) => f.ruleId).join(", ") || "nothing"}]`,
      });
    } else {
      // Benign control: must not produce a finding at or above medium.
      const tripped = findings.filter((f) => SEV_RANK[f.severity] >= SEV_RANK.medium);
      const ok = tripped.length === 0;
      if (!ok) falsePositives++;
      caseResults.push({
        id: c.id,
        title: c.title,
        malicious: false,
        pass: ok,
        reason: ok
          ? "clean (no false positive)"
          : `FALSE POSITIVE: ${tripped.map((f) => f.ruleId).join(", ")}`,
      });
    }
  }

  return {
    total: corpus.cases.length,
    malicious: maliciousCases.length,
    benign: benignCases.length,
    detected,
    falsePositives,
    recall: maliciousCases.length ? detected / maliciousCases.length : 1,
    caseResults,
  };
}

export function loadCorpus(path: string): Corpus {
  return JSON.parse(readFileSync(path, "utf8")) as Corpus;
}

// Default corpus shipped with the repo, resolved relative to this module so it
// works from dist/ too. dist/mcp-scan/bench.js -> ../../bench/corpus.json
export function defaultCorpusPath(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return resolve(here, "../../bench/corpus.json");
}
