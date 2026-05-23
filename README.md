# PromptGuard

> A local-first Model Context Protocol (MCP) server that scans developer prompts for secrets, personally identifiable information, and cost before they reach the language model. Includes prompt compression and structural feedback.

## What it does

PromptGuard plugs into Claude Desktop (or any MCP-compatible client) and exposes four tools:

- `scan_prompt`: detects 22 patterns of sensitive data including AWS keys, GitHub tokens, OpenAI / Anthropic / Stripe / Slack keys, credit cards (Luhn validated), US SSNs, Indian Aadhaar (Verhoeff validated), PAN, GSTIN, UPI handles, IFSC codes, emails, and phone numbers. Sub-millisecond scans, with per-finding explanations.
- `optimize_prompt`: suggests a cleaner version of a prompt with structural feedback (missing task verb, missing output format). Stays silent on already-good prompts.
- `compress_prompt`: aggressive token reduction with three levels (light, medium, aggressive). Preserves code blocks. Realistic 10 to 25 percent savings on typical prompts.
- `estimate_cost`: token count and dollar estimate across Claude (Opus, Sonnet, Haiku) and OpenAI (GPT-4o, GPT-4o-mini). Uses the correct tokenizer per model (o200k_base for GPT-4o, cl100k_base for older OpenAI and as an approximation for Claude).

All analysis runs on the user's machine. No prompt content is transmitted to external services.

## Installation

The simplest setup uses `npx`, no manual install required. Add this block to Claude Desktop's MCP config at `~/Library/Application Support/Claude/claude_desktop_config.json` (create the file if it does not exist):

```json
{
  "mcpServers": {
    "promptguard": {
      "command": "npx",
      "args": ["-y", "@krishojha1810/promptguard-mcp"]
    }
  }
}
```

Restart Claude Desktop. The PromptGuard tools become available immediately.

If `node` or `npx` are not on Claude Desktop's PATH (common when Node is installed via nvm), use the absolute path:

```json
{
  "mcpServers": {
    "promptguard": {
      "command": "/absolute/path/to/npx",
      "args": ["-y", "@krishojha1810/promptguard-mcp"]
    }
  }
}
```

To find your npx path, run `which npx` in a terminal.

## Usage in Claude

Ask Claude to use any of the tools by name. For example:

- "Use the scan_prompt tool on this text: ..."
- "Use compress_prompt on this prompt at aggressive level."
- "Use estimate_cost to compare gpt-4o-mini and claude-sonnet-4-6 for this prompt."

Claude will call the appropriate tool and present the result.

## Requirements

- Node.js 20 or later
- Claude Desktop, or any other MCP-compatible client

## Development

Clone the repository if you want to contribute or run from source:

```bash
git clone https://github.com/KrishOjha1810/promptguard-mcp.git
cd promptguard-mcp
npm install
npm run build
npm test
```

Scripts available:

```bash
npm run dev        # Run from source via tsx
npm run build      # Compile to dist/
npm run test       # Run the test suite
npm run typecheck  # Type check without emitting
```

## License

MIT. See [LICENSE](./LICENSE) for the full text.
