#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

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
        "Hello-world tool , confirms the PromptGuard MCP server is alive. Returns 'pong' with the server version.",
      inputSchema: {
        type: "object",
        properties: {},
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
