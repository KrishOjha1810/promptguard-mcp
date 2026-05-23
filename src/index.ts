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
import { optimizePrompt } from "./optimize.js";
import { compressPrompt, type CompressionLevel } from "./compress.js";

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
      name: "optimize_prompt",
      description:
        "Suggest a tightened version of a prompt by removing filler, verbose phrases, and hedging, and by flagging missing structure such as no task verb or no output format. Stays silent (shouldSuggest:false) on prompts that are already concise. Returns the original and the suggested rewrite side by side along with estimated token savings.",
      inputSchema: {
        type: "object",
        properties: {
          text: {
            type: "string",
            description: "The prompt text to optimize.",
          },
        },
        required: ["text"],
      },
    },
    {
      name: "compress_prompt",
      description:
        "Aggressively compress a prompt to save tokens. Strips filler, hedging, connector adverbs, and at the aggressive level rewrites question-style openers and drops articles. Use when the goal is fewer tokens (rate limits, cost), not clarity. For polite tightening with structural feedback, use optimize_prompt instead. Realistic savings are 10 to 25 percent depending on input and level; viral claims of 60 percent or more measure narrow output slices, not full sessions.",
      inputSchema: {
        type: "object",
        properties: {
          text: {
            type: "string",
            description: "The prompt text to compress.",
          },
          level: {
            type: "string",
            enum: ["light", "medium", "aggressive"],
            description:
              "How aggressive to be. Light: only obvious filler. Medium: also connector adverbs and meta-commentary. Aggressive: also drops articles after task verbs and restates question patterns. Defaults to medium.",
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

  if (request.params.name === "optimize_prompt") {
    const args = (request.params.arguments ?? {}) as { text?: string };
    if (typeof args.text !== "string") {
      throw new Error("optimize_prompt requires a 'text' string argument.");
    }

    const result = optimizePrompt(args.text);

    let summary: string;
    if (!result.shouldSuggest) {
      summary = "Prompt looks good. No changes recommended.";
    } else {
      const removed = result.optimizations
        .filter((o) => o.after.length === 0)
        .map((o) => `"${o.before.trim()}"`);
      const rewritten = result.optimizations
        .filter((o) => o.after.length > 0)
        .map((o) => `"${o.before.trim()}" to "${o.after.trim()}"`);

      const TIP_LABELS: Record<string, string> = {
        missing_task_verb: "start with a direct verb (such as Write, Explain, Generate)",
        missing_output_format: "specify the output format (such as bulleted list, JSON, or markdown)",
      };
      const tipParts = result.structuralIssues.map(
        (i) => TIP_LABELS[i.type] ?? i.description,
      );

      summary =
        `Suggested rewrite (saved ${result.tokensSaved} tokens, ${result.percentSaved}% leaner):\n\n` +
        `> ${result.optimizedText}`;

      if (removed.length > 0) {
        summary += `\n\nRemoved: ${removed.join(", ")}.`;
      }
      if (rewritten.length > 0) {
        summary += `\nTightened: ${rewritten.join("; ")}.`;
      }
      if (tipParts.length > 0) {
        summary += `\n\nTip: ${tipParts.join("; ")}.`;
      }
    }

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

  if (request.params.name === "compress_prompt") {
    const args = (request.params.arguments ?? {}) as {
      text?: string;
      level?: CompressionLevel;
    };
    if (typeof args.text !== "string") {
      throw new Error("compress_prompt requires a 'text' string argument.");
    }
    const level = args.level ?? "medium";
    if (!["light", "medium", "aggressive"].includes(level)) {
      throw new Error(
        "compress_prompt 'level' must be 'light', 'medium', or 'aggressive'.",
      );
    }

    const result = compressPrompt(args.text, level);

    const summary =
      `Compressed (${result.level}): ${result.originalTokens} to ${result.compressedTokens} tokens, saved ${result.tokensSaved} (${result.percentSaved}% leaner).\n\n` +
      `> ${result.compressedText}\n\n` +
      `Note: ${result.warning}`;

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
