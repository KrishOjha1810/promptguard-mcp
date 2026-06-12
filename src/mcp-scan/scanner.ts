import { scanText } from "../detectors/secrets.js";
import { POISONING_RULES, UNICODE_CLASSES } from "./poisoning-rules.js";
import type { McpDocument, McpFinding, McpScanResult, McpServerEntry } from "./types.js";

// Best-effort JSON parse that tolerates // and /* */ comments and trailing
// commas, which appear in real-world MCP config files. Returns null on failure.
export function tolerantParse(text: string): unknown | null {
  try {
    return JSON.parse(text);
  } catch {
    // fall through to cleanup
  }
  try {
    const stripped = text
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1")
      .replace(/,(\s*[}\]])/g, "$1");
    return JSON.parse(stripped);
  } catch {
    return null;
  }
}

function redact(s: string, max = 48): string {
  const collapsed = s.replace(/\s+/g, " ").trim();
  if (collapsed.length <= max) return collapsed;
  return collapsed.slice(0, max) + "...";
}

// Scan an arbitrary string value for tool-poisoning phrasing and hidden unicode.
function scanStringField(
  value: string,
  location: string,
  findings: McpFinding[],
): void {
  for (const rule of POISONING_RULES) {
    rule.pattern.lastIndex = 0;
    const m = rule.pattern.exec(value);
    if (m) {
      findings.push({
        category: "tool_poisoning",
        ruleId: rule.id,
        title: rule.title,
        severity: rule.severity,
        confidence: rule.confidence,
        location,
        evidence: redact(m[0]),
        explanation: rule.explanation,
        owasp: rule.owasp,
      });
    }
  }

  // Hidden unicode: scan by code point.
  for (const cls of UNICODE_CLASSES) {
    let hit = false;
    for (const ch of value) {
      const cp = ch.codePointAt(0);
      if (cp !== undefined && cls.test(cp)) {
        hit = true;
        break;
      }
    }
    if (hit) {
      findings.push({
        category: "hidden_unicode",
        ruleId: `unicode_${cls.id}`,
        title: cls.title,
        severity: cls.severity,
        confidence: 0.95,
        location,
        evidence: `${cls.title} present (rendered invisible)`,
        explanation: cls.explanation,
        owasp: ["LLM01", "T2"],
      });
    }
  }
}

// Recursively walk every string in a tool definition (names, descriptions,
// defaults, enums, nested schema), running full-schema poisoning checks. This
// counters Full-Schema Poisoning, where the payload hides in fields other than
// description.
function walkToolValue(
  value: unknown,
  location: string,
  findings: McpFinding[],
): void {
  if (typeof value === "string") {
    scanStringField(value, location, findings);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => walkToolValue(v, `${location}[${i}]`, findings));
    return;
  }
  if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      // Field NAMES can also carry payloads, so scan the key text too.
      scanStringField(k, `${location}.<key:${redact(k, 24)}>`, findings);
      walkToolValue(v, `${location}.${k}`, findings);
    }
  }
}

function toolName(tool: unknown): string | null {
  if (tool && typeof tool === "object" && "name" in tool) {
    const n = (tool as { name: unknown }).name;
    if (typeof n === "string") return n;
  }
  return null;
}

// Scan one server's install config (command, args, env) for hardcoded secrets,
// reusing the prompt-secret engine on each value.
function scanServerConfig(
  serverName: string,
  entry: McpServerEntry,
  findings: McpFinding[],
): void {
  const values: { path: string; text: string }[] = [];
  if (typeof entry.command === "string")
    values.push({ path: `${serverName}.command`, text: entry.command });
  if (Array.isArray(entry.args))
    entry.args.forEach((a, i) => {
      if (typeof a === "string")
        values.push({ path: `${serverName}.args[${i}]`, text: a });
    });
  if (entry.env && typeof entry.env === "object")
    for (const [k, v] of Object.entries(entry.env))
      if (typeof v === "string")
        values.push({ path: `${serverName}.env.${k}`, text: v });
  if (typeof entry.url === "string")
    values.push({ path: `${serverName}.url`, text: entry.url });

  const sevRank: Record<string, number> = { low: 1, medium: 2, high: 3, critical: 4 };
  for (const { path, text } of values) {
    const res = scanText(text);
    // Dedupe overlapping matches within the same value: if a stronger finding's
    // matched text contains a weaker one (for example a DB connection string
    // whose host looks like an email), keep only the stronger finding.
    const kept = res.findings.filter((f) => {
      return !res.findings.some(
        (other) =>
          other !== f &&
          sevRank[other.severity] >= sevRank[f.severity] &&
          other.matched.length > f.matched.length &&
          other.matched.includes(f.matched),
      );
    });
    for (const f of kept) {
      findings.push({
        category: "secret_in_config",
        ruleId: f.type,
        title: `Hardcoded secret in config: ${f.rule}`,
        severity: f.severity,
        confidence: f.confidence,
        location: `mcpServers.${path}`,
        evidence: redact(f.matched),
        explanation:
          f.explanation +
          " Hardcoded directly in an MCP config file; move it to an environment variable or secret manager.",
        owasp: ["LLM06", "T3"],
      });
    }
  }
}

export function scanMcp(text: string): McpScanResult {
  const start = performance.now();
  const findings: McpFinding[] = [];
  let serversScanned = 0;
  let toolsScanned = 0;

  const parsed = tolerantParse(text) as McpDocument | null;

  if (!parsed || typeof parsed !== "object") {
    // Could not parse structure. Fall back to a raw secret scan so we still
    // catch hardcoded keys, and warn that structural checks were skipped.
    const res = scanText(text);
    for (const f of res.findings) {
      findings.push({
        category: "secret_in_config",
        ruleId: f.type,
        title: `Hardcoded secret: ${f.rule}`,
        severity: f.severity,
        confidence: f.confidence,
        location: "(raw text, offset " + f.start + ")",
        evidence: redact(f.matched),
        explanation: f.explanation,
        owasp: ["LLM06"],
      });
    }
    findings.push({
      category: "parse_warning",
      ruleId: "parse_failed",
      title: "Could not parse as JSON",
      severity: "low",
      confidence: 1,
      location: "(file)",
      evidence: "structural checks skipped",
      explanation:
        "The input was not valid JSON, so tool-poisoning and shadowing checks were skipped. Only a raw secret scan ran.",
      owasp: [],
    });
    return {
      findings,
      serversScanned,
      toolsScanned,
      parsed: false,
      scanMs: performance.now() - start,
    };
  }

  // Collect tool names across all servers for shadowing detection.
  const toolNameToLocations = new Map<string, string[]>();

  const serverMaps: Record<string, McpServerEntry>[] = [];
  if (parsed.mcpServers) serverMaps.push(parsed.mcpServers);
  if (parsed.servers) serverMaps.push(parsed.servers);

  for (const map of serverMaps) {
    for (const [name, entry] of Object.entries(map)) {
      serversScanned++;
      scanServerConfig(name, entry, findings);
      if (Array.isArray(entry.tools)) {
        entry.tools.forEach((tool, i) => {
          toolsScanned++;
          walkToolValue(tool, `mcpServers.${name}.tools[${i}]`, findings);
          const tn = toolName(tool);
          if (tn) {
            const arr = toolNameToLocations.get(tn) ?? [];
            arr.push(`${name}.tools[${i}]`);
            toolNameToLocations.set(tn, arr);
          }
        });
      }
    }
  }

  // Top-level tools array (a tools/list document).
  if (Array.isArray(parsed.tools)) {
    parsed.tools.forEach((tool, i) => {
      toolsScanned++;
      walkToolValue(tool, `tools[${i}]`, findings);
      const tn = toolName(tool);
      if (tn) {
        const arr = toolNameToLocations.get(tn) ?? [];
        arr.push(`tools[${i}]`);
        toolNameToLocations.set(tn, arr);
      }
    });
  }

  // Shadowing: same tool name defined in more than one place.
  for (const [name, locs] of toolNameToLocations) {
    if (locs.length > 1) {
      findings.push({
        category: "tool_shadowing",
        ruleId: "duplicate_tool_name",
        title: `Tool name collision: "${name}"`,
        severity: "high",
        confidence: 0.85,
        location: locs.join(", "),
        evidence: `"${name}" defined ${locs.length} times`,
        explanation:
          "The same tool name is defined by more than one server or entry. A malicious server can shadow a trusted tool by claiming its name, so the model calls the attacker's version.",
        owasp: ["LLM01", "T2"],
      });
    }
  }

  return {
    findings,
    serversScanned,
    toolsScanned,
    parsed: true,
    scanMs: performance.now() - start,
  };
}
