# PromptGuard

> A local-first Model Context Protocol (MCP) server that scans developer prompts for secrets, personally identifiable information, and cost before they reach the language model. Includes prompt compression and structural feedback.

Also available as a browser extension for inline scanning on claude.ai, ChatGPT, Gemini, Perplexity, You.com, and Mistral. See [`extension/`](./extension) for that.

## What it does

PromptGuard exposes four tools to any MCP-compatible client:

- `scan_prompt`: detects 23 patterns of sensitive data including AWS keys, GitHub tokens, OpenAI / Anthropic / Stripe / Slack / npm tokens, credit cards (Luhn validated), US SSNs, Indian Aadhaar (Verhoeff validated), PAN, GSTIN, UPI handles, IFSC codes, emails, and phone numbers. Sub-millisecond scans, with per-finding explanations.
- `optimize_prompt`: suggests a cleaner version of a prompt with structural feedback (missing task verb, missing output format). Stays silent on already-good prompts.
- `compress_prompt`: aggressive token reduction with three levels (light, medium, aggressive). Preserves code blocks. Realistic 10 to 25 percent savings on typical prompts.
- `estimate_cost`: token count and dollar estimate across Claude (Opus, Sonnet, Haiku) and OpenAI (GPT-4o, GPT-4o-mini). Uses the correct tokenizer per model (o200k_base for GPT-4o, cl100k_base for older OpenAI and as an approximation for Claude).

All analysis runs on the user's machine. No prompt content is transmitted to external services.

## Works in any MCP-compatible client

PromptGuard is just an MCP server, so any client that speaks the Model Context Protocol can use it. Verified working in:

- **Claude Desktop**
- **Cursor** (added MCP support in 2025)
- **Cline** (formerly Claude-dev, VS Code)
- **Windsurf** (Codeium)
- **Continue.dev** (VS Code and JetBrains)
- **Goose** (Block)

The config below works in all of them with minor file-path adjustments. See the "Configuration" section for each client.

## Installation

The simplest setup uses `npx`. No manual install required.

### Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or the equivalent path on Windows / Linux:

```json
{
  "mcpServers": {
    "promptguard": {
      "command": "npx",
      "args": ["-y", "@promptguardapp/mcp"]
    }
  }
}
```

Restart Claude Desktop. The PromptGuard tools become available immediately.

### Cursor

Cursor reads MCP servers from `~/.cursor/mcp.json`. Same config shape:

```json
{
  "mcpServers": {
    "promptguard": {
      "command": "npx",
      "args": ["-y", "@promptguardapp/mcp"]
    }
  }
}
```

### Continue.dev

In your Continue config (`~/.continue/config.json`), add an MCP server entry:

```json
{
  "experimental": {
    "modelContextProtocolServers": [
      {
        "transport": {
          "type": "stdio",
          "command": "npx",
          "args": ["-y", "@promptguardapp/mcp"]
        }
      }
    ]
  }
}
```

### Cline / Windsurf / Goose

These also accept the standard MCP stdio config. Add a server entry pointing at `npx -y @promptguardapp/mcp` and you are good.

### node / npx not on PATH

If `node` or `npx` are not on the client's PATH (common when Node is installed via nvm), use absolute paths:

```json
{
  "mcpServers": {
    "promptguard": {
      "command": "/absolute/path/to/npx",
      "args": ["-y", "@promptguardapp/mcp"]
    }
  }
}
```

Run `which npx` in a terminal to find your path.

## Usage

In any client, ask the model to use the tools by name. For example:

- "Use scan_prompt on this text: ..."
- "Use compress_prompt on this prompt at aggressive level."
- "Use estimate_cost to compare gpt-4o-mini and claude-sonnet-4-6 for this prompt."

The model will call the appropriate tool and present the result inline.

## Requirements

- Node.js 20 or later
- Any MCP-compatible client (Claude Desktop, Cursor, Cline, Windsurf, Continue.dev, Goose, or any other client speaking the Model Context Protocol over stdio)

## Claude Code hook (automatic scanning of every prompt you send)

If you use [Claude Code](https://docs.claude.com/en/docs/claude-code) (the CLI), you can install PromptGuard as a `UserPromptSubmit` hook so every prompt you type gets scanned automatically before it is sent. No tool call required, no per-prompt action by you. If the scanner finds nothing, the prompt goes through silently. If it finds something, you see an inline warning listing what was caught.

Edit `~/.claude/settings.json` and add this block (merge with existing `hooks` if you have one):

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "npx -y -p @promptguardapp/mcp promptguard-hook",
            "timeout": 5
          }
        ]
      }
    ]
  }
}
```

That is the entire install. The first time you submit a prompt, `npx` downloads `@promptguardapp/mcp` and caches it. From then on, every prompt is scanned in roughly 50 ms.

The hook never blocks your prompt. It only warns. You decide whether to retry redacted.

## Browser extension

Beyond the MCP server, PromptGuard ships as a browser extension that scans prompts inline on AI chat sites (Claude.ai, ChatGPT, Gemini, Perplexity, You.com, Mistral). It draws Grammarly-style wavy underlines under detected secrets and PII, and offers one-click redaction, cost estimation, and prompt optimization.

See [`extension/README.md`](./extension/README.md) for install instructions and architecture details.

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
npm run dev               # Run MCP server from source via tsx
npm run build             # Compile to dist/
npm run test              # Run the full test suite
npm run typecheck         # Type check without emitting
npm run extension:build   # Build the browser extension
npm run extension:watch   # Watch and rebuild extension on changes
npm run extension:icons   # Regenerate PNG icons from icon.svg
npm run extension:zip     # Produce a Chrome Web Store-ready ZIP
```

## License

MIT. See [LICENSE](./LICENSE) for the full text.
