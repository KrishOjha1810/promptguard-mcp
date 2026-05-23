#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { scanText } from "./detectors/secrets.js";
import {
  estimateCost,
  SUPPORTED_MODELS,
  type SupportedModel,
} from "./cost.js";

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
        "Scan a prompt for secrets, API keys, credentials, and personally identifiable information (emails, phone numbers, credit cards, SSNs) before it is sent to the language model. Returns findings with location, severity, and a human-readable explanation, plus an optional redacted version of the input.",
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
    {
      name: "estimate_cost",
      description:
        "Estimate the token count and dollar cost of a prompt for a specific model before sending it. Useful for previewing the cost of large prompts, bulk operations, or deciding which model to use.",
      inputSchema: {
        type: "object",
        properties: {
          text: {
            type: "string",
            description: "The prompt text to measure.",
          },
          model: {
            type: "string",
            enum: SUPPORTED_MODELS,
            description: "The target model for the estimate.",
          },
          expectedOutputTokens: {
            type: "number",
            description:
              "Optional override for expected output token count. When omitted, defaults to min(inputTokens, 1024).",
          },
        },
        required: ["text", "model"],
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
    const result = scanText(args.text);
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

  if (request.params.name === "estimate_cost") {
    const args = (request.params.arguments ?? {}) as {
      text?: string;
      model?: SupportedModel;
      expectedOutputTokens?: number;
    };
    if (typeof args.text !== "string") {
      throw new Error("estimate_cost requires a 'text' string argument.");
    }
    if (!args.model || !SUPPORTED_MODELS.includes(args.model)) {
      throw new Error(
        `estimate_cost requires 'model' to be one of: ${SUPPORTED_MODELS.join(", ")}.`,
      );
    }

    const result = estimateCost(args.text, args.model, args.expectedOutputTokens);
    const approxNote = result.approximate
      ? " (token count is an approximation for Claude models, exact for OpenAI)"
      : "";

    const summary =
      `Model: ${result.model}\n` +
      `Input tokens: ${result.inputTokens}${approxNote}\n` +
      `Estimated output tokens: ${result.estimatedOutputTokens}\n` +
      `Input cost: $${result.inputCostUsd.toFixed(6)}\n` +
      `Estimated output cost: $${result.estimatedOutputCostUsd.toFixed(6)}\n` +
      `Total estimated cost: $${result.totalEstimatedUsd.toFixed(6)}\n` +
      `Pricing last updated: ${result.pricingLastUpdated}`;

    return {
      content: [
        { type: "text", text: summary },
        {
          type: "text",
          text: "```json\n" + JSON.stringify(result, null, 2) + "\n```",
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
