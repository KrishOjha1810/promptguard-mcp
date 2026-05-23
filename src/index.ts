#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { scanForSecrets } from "./detectors/secrets.js";

const PROMPTGUARD_VERSION = "0.0.1";

const server = new Server(
  {
    name: "promptguard",
    version: PROMPTGUARD_VERSION,
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "ping",
      description:
        "Hello-world tool that confirms the PromptGuard MCP server is alive. Returns 'pong' with the server version.",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "scan_prompt",
      description:
        "Scan a prompt for secrets, API keys, credentials, and other sensitive data before it is sent to the language model. Returns findings with location, severity, and a human-readable explanation, plus an optional redacted version of the input.",
      inputSchema: {
        type: "object",
        properties: {
          text: {
            type: "string",
            description: "The prompt text to scan.",
          },
          mode: {
            type: "string",
            enum: ["warn", "redact"],
            description:
              "Return raw matches (warn) or replace each finding with a placeholder (redact). Defaults to warn.",
          },
        },
        required: ["text"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === "ping") {
    return {
      content: [
        {
          type: "text",
          text: `pong from PromptGuard v${PROMPTGUARD_VERSION}`,
        },
      ],
    };
  }

  if (request.params.name === "scan_prompt") {
    const args = (request.params.arguments ?? {}) as {
      text?: string;
      mode?: "warn" | "redact";
    };
    if (typeof args.text !== "string") {
      throw new Error("scan_prompt requires a 'text' string argument.");
    }
    const result = scanForSecrets(args.text);
    const mode = args.mode ?? "warn";

    const summary =
      result.findings.length === 0
        ? "No secrets or sensitive data detected."
        : `Found ${result.findings.length} potential issue${result.findings.length === 1 ? "" : "s"}:\n\n` +
          result.findings
            .map(
              (f, i) =>
                `${i + 1}. [${f.severity.toUpperCase()}] ${f.rule}\n` +
                `   Position ${f.start}-${f.end} (length ${f.end - f.start})\n` +
                `   Why: ${f.explanation}`,
            )
            .join("\n\n");

    const payload = {
      findings: result.findings,
      redactedText: mode === "redact" ? result.redactedText : args.text,
      scanMs: Math.round(result.scanMs * 100) / 100,
      rulesRun: result.rulesRun,
    };

    return {
      content: [
        { type: "text", text: summary },
        {
          type: "text",
          text: "```json\n" + JSON.stringify(payload, null, 2) + "\n```",
        },
      ],
    };
  }

  throw new Error(`Unknown tool: ${request.params.name}`);
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stdout is reserved for MCP protocol; log to stderr.
  console.error(
    `PromptGuard MCP server v${PROMPTGUARD_VERSION} running on stdio`,
  );
}

main().catch((error) => {
  console.error("PromptGuard failed to start:", error);
  process.exit(1);
});
