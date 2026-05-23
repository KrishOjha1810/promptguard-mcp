# PromptGuard

> A local-first Model Context Protocol (MCP) server that scans developer prompts for secrets, personally identifiable information, and cost before they reach the language model.

## Overview

PromptGuard integrates with Claude Desktop, or any other MCP-compatible client, as an MCP server. As prompts are constructed it analyzes them locally to:

- Detect secrets and credentials such as cloud provider API keys, access tokens, private keys, and JWTs
- Detect personally identifiable information including emails, phone numbers, credit card numbers, and social security numbers
- Estimate token count and cost across supported models
- Surface structural issues in the prompt itself

All analysis runs on the user's machine. No prompt content is transmitted to external services.

## Requirements

- Node.js 20 or later
- Claude Desktop, or any other MCP-compatible client

## Installation

```bash
git clone https://github.com/KrishOjha1810/promptguard-mcp.git
cd promptguard-mcp
npm install
npm run build
```

## Configuration

Add the server to the Claude Desktop configuration file at `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "promptguard": {
      "command": "node",
      "args": ["/absolute/path/to/promptguard-mcp/dist/index.js"]
    }
  }
}
```

Replace `/absolute/path/to/promptguard-mcp` with the directory containing the cloned repository. If `node` is not on the system PATH (for example, when installed via nvm) provide the absolute path to the node binary as the value of `command`.

Restart Claude Desktop to load the server.

## Development

```bash
npm run dev        # Run from source
npm run build      # Compile to dist/
npm run test       # Run the test suite
npm run typecheck  # Type-check without emitting
```

## Status

The project is under active development. The current release exposes a minimal MCP `ping` tool that serves as the integration baseline. Additional detection tools are being added incrementally.

## License

MIT. See [LICENSE](./LICENSE) for the full text.
