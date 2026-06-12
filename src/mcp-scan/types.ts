import type { Severity } from "../types.js";

export type McpFindingCategory =
  | "secret_in_config"
  | "tool_poisoning"
  | "hidden_unicode"
  | "tool_shadowing"
  | "rug_pull"
  | "drift"
  | "parse_warning";

export type McpFinding = {
  category: McpFindingCategory;
  ruleId: string;
  title: string;
  severity: Severity;
  confidence: number;
  // Dotted path to where the issue lives, e.g.
  // "mcpServers.github.env.GITHUB_TOKEN" or "tools[2].inputSchema.properties.path.description"
  location: string;
  // Short, already-redacted evidence string safe to print.
  evidence: string;
  explanation: string;
  // OWASP references: LLM01..LLM10 and/or Agentic T1..T15.
  owasp: string[];
};

export type McpScanResult = {
  findings: McpFinding[];
  serversScanned: number;
  toolsScanned: number;
  parsed: boolean;
  scanMs: number;
};

// A minimal shape for the two MCP document kinds we accept:
// 1. An install config (claude_desktop_config.json, .mcp.json, .cursor/mcp.json)
//    with an "mcpServers" map.
// 2. A tools/list-style document with a "tools" array.
export type McpServerEntry = {
  command?: string;
  args?: unknown[];
  env?: Record<string, unknown>;
  url?: string;
  tools?: unknown[];
};

export type McpDocument = {
  mcpServers?: Record<string, McpServerEntry>;
  servers?: Record<string, McpServerEntry>;
  tools?: unknown[];
};
