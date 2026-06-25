# PromptGuard

> Catch secrets, PII, and runaway token cost in your prompts before they ever reach the language model. Local-first, zero telemetry.

[![npm](https://img.shields.io/badge/npm-%40promptguardapp%2Fmcp-CB3837?logo=npm&logoColor=white)](https://www.npmjs.com/package/@promptguardapp/mcp)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![MCP](https://img.shields.io/badge/Model%20Context%20Protocol-server-5A45FF)](https://modelcontextprotocol.io/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](./LICENSE)
[![Node](https://img.shields.io/badge/Node-%3E%3D20-339933?logo=node.js&logoColor=white)](https://nodejs.org/)

PromptGuard is a Model Context Protocol (MCP) server, plus a browser extension and a VS Code extension, that scans developer prompts on your own machine before they are sent anywhere. It flags leaked credentials and personal data, previews token cost, and tightens bloated prompts.

## What it does

Prompts are a quiet exfiltration channel. Developers paste real AWS keys, GitHub tokens, customer emails, and entire SSN-laden support tickets into a chat box, and that text leaves the building the moment they hit send. The same prompts are often padded with filler that burns tokens (and money) on every call.

PromptGuard sits between you and the language model and runs three checks locally, before the prompt is transmitted:

- **Is anything sensitive in here?** Detects 27 patterns of secrets and personally identifiable information, with per-finding explanations and optional redaction.
- **What will this cost?** Counts tokens with the correct tokenizer per model and estimates the dollar cost before you send.
- **Can this be tighter?** Suggests a leaner rewrite (optimize) or aggressively strips tokens (compress), while preserving code blocks.

Every byte of analysis happens on the user's machine. No prompt content is transmitted to any external service.

## Features

### Secret detection (17 patterns)

AWS access key IDs, GitHub classic / fine-grained / OAuth tokens, OpenAI API keys, Anthropic API keys, Stripe live and test secret keys, Slack bot and user tokens, Slack incoming webhook URLs, Google API keys, npm access tokens, SendGrid API keys, PEM-encoded private keys, database connection strings with inline credentials (Mongo, Postgres, MySQL, Redis, AMQP), and JSON Web Tokens. Each finding carries a severity, a confidence score, and a human-readable explanation of why it matters.

### PII detection (10 patterns)

- **Universal:** email addresses, credit card numbers (card-network prefix + Luhn-validated).
- **US:** phone numbers, Social Security Numbers.
- **India:** mobile numbers, Aadhaar (Verhoeff checksum validated), PAN, GSTIN, UPI IDs, and IFSC codes.

Validators cut false positives: a digit run is only flagged as a card if it is a real card length, starts with a known card-network prefix (Visa, Mastercard, Amex, Discover, Diners, JCB, UnionPay), and passes the Luhn check, so long numeric IDs (tweet IDs, order numbers, block heights) are not mistaken for cards. A 12-digit number is only flagged as Aadhaar if it passes the Verhoeff checksum.

### Token and cost estimation

Token counts and dollar estimates across Claude (Opus 4.8, Opus 4.7, Sonnet 4.6, Haiku 4.5) and OpenAI (GPT-4o, GPT-4o-mini), powered by `js-tiktoken`. The correct tokenizer is used per model: `o200k_base` for GPT-4o, `cl100k_base` for older OpenAI models and as a flagged approximation for Claude (which does not publish its tokenizer).

### Prompt optimization and compression

- **optimize_prompt** removes filler, verbose phrases, and hedging, and flags missing structure (no task verb, no output format). It stays silent on prompts that are already concise.
- **compress_prompt** does aggressive token reduction at three levels (light, medium, aggressive), preserving fenced code blocks. Realistic savings are 10 to 25 percent on typical prompts.

### Local-first by design

No backend, no telemetry, no accounts, no analytics SDKs. The MCP server speaks stdio, and the browser extension makes zero network requests of its own. See [Privacy](#privacy).

### Three surfaces, one engine

The same `scanText` detection engine backs all three products:

- **MCP server** for any MCP-compatible client (Claude Desktop, Cursor, Cline, Windsurf, Continue.dev, Goose) and as a Claude Code prompt hook.
- **Browser extension** for inline scanning on Claude.ai, ChatGPT, Gemini, Perplexity, You.com, and Mistral. See [`extension/README.md`](./extension/README.md).
- **VS Code extension** that scans the current document and surfaces findings in the Problems panel. See [`vscode-extension/README.md`](./vscode-extension/README.md).

## How it works

A prompt comes in, the engine runs every rule against it, validators discard false positives, and the result is a verdict: either a clean pass or a list of findings (with an optional redacted copy of the text).

```mermaid
flowchart LR
    A[Prompt text] --> B[scanText engine]
    B --> C[27 rules:<br/>17 secret + 10 PII]
    C --> D{Validators<br/>Luhn / Verhoeff}
    D -->|clean| E[No findings]
    D -->|match| F[Findings:<br/>severity + explanation]
    F --> G[Optional redacted text]
```

Scans are sub-millisecond in-process, so the check adds no meaningful latency to your workflow. The MCP server exposes the engine (and the cost, optimize, and compress tools) over stdio; the browser and VS Code extensions bundle the very same engine so behavior is identical everywhere.

### MCP tools

The server exposes four tools to any MCP-compatible client:

| Tool | What it does |
|---|---|
| `scan_prompt` | Detects secrets and PII. Returns findings with location, severity, and explanation, plus an optional redacted version (`mode: "warn"` or `"redact"`). |
| `optimize_prompt` | Suggests a tightened rewrite and flags missing structure. Stays silent on already-good prompts. |
| `compress_prompt` | Aggressive token reduction at `light`, `medium`, or `aggressive` levels. Preserves code blocks. |
| `estimate_cost` | Token count and dollar estimate for a given `model`, with an optional `expectedOutputTokens` override. |

(A `ping` health-check tool is also exposed so a client can confirm the server is alive.)

## MCP security: scan-mcp

Beyond scanning prompts, PromptGuard scans the MCP servers you install. MCP is a transport spec, not a security model: there is no signing of tool definitions, no sandbox requirement, and no capability model. A malicious or compromised server can hide instructions in a tool description (tool poisoning), impersonate a trusted tool (shadowing), or change its definition after you approved it (rug pull). `scan-mcp` checks for these locally, with no account and no network.

```bash
# Scan an MCP config or a tools/list document
npx @promptguardapp/mcp scan-mcp ./.mcp.json

# Approve the current tool definitions, then detect tampering later
npx @promptguardapp/mcp scan-mcp pin ./.mcp.json     # writes .mcp.json.pglock
npx @promptguardapp/mcp scan-mcp ./.mcp.json         # flags any drift as rug-pull

# CI gate: SARIF for code scanning, exit non-zero on findings
npx @promptguardapp/mcp scan-mcp ./.mcp.json --sarif --fail-on high

# Run the public benchmark corpus
npx @promptguardapp/mcp scan-mcp bench
```

What it detects:

- **Hardcoded secrets in config** (env, args, url), reusing the prompt secret engine. GitGuardian found 24,008 secrets in public MCP config files in 2025.
- **Tool poisoning**: instruction-override, hide-from-user directives, embedded system tags, read-and-send exfiltration, cross-tool redirection. Full-schema: every field is scanned (names, defaults, nested schema), not just the description.
- **Hidden unicode**: zero-width, bidirectional-override, and tag characters used to hide instructions from human reviewers.
- **Tool shadowing**: the same tool name claimed by more than one server.
- **Rug-pull**: a previously pinned tool definition that changed. This is the capability a local tool does better than a cloud scanner, because the spec never requires re-approval on change.

Findings map to OWASP LLM Top 10 (LLM01, LLM03, LLM06) and OWASP Agentic Threats (T2, T3, T6). The OWASP MCP Top 10 is referenced as emerging.

The [`bench/`](./bench) directory is a reproducible, contributable benchmark corpus (inspired by AgentDojo). `scan-mcp registry <manifest>` produces a [safety leaderboard](./REGISTRY.md) of scanned servers.

### Rug-pull monitor (always-on)

A one-time scan cannot catch a server that is benign when you approve it and turns malicious later. The monitor keeps a local, git-diffable record of every tool definition you have approved and re-checks on every session. It hashes each field of a tool definition separately, so it tells you exactly *what* changed, not just that something did, and it tiers severity so it does not cry wolf:

- a changed description that trips a poisoning rule is a **critical rug-pull**
- a benign description change is medium (review)
- an input schema that gained fields is high (a new exfiltration channel)
- a destructive/read-only annotation flip is high
- a cosmetic or whitespace-only change is silent

```bash
npx @promptguardapp/mcp scan-mcp pin ./.mcp.json   # approve current definitions
npx @promptguardapp/mcp scan-mcp ./.mcp.json       # later: surfaces only what changed
```

Wired into the SessionStart hook (below), this runs automatically: new tools are pinned silently on first sight, and only changes ever surface.

### Flight recorder (runtime audit of tool calls)

`scan-mcp` looks at definitions before you install. The flight recorder looks at what the agent *actually did* at runtime, by reading the OpenTelemetry tool-call spans your agent already emits (`gen_ai.tool.call.*`, MCP `tools/call`). It needs no proxy and no network; it just reads spans.

```bash
npx @promptguardapp/mcp scan-mcp record ./agent-trace.jsonl \
  --log audit.jsonl --export-aat article12.json
npx @promptguardapp/mcp scan-mcp verify audit.jsonl   # detect any tampering
```

It detects things a pre-install scan cannot see:

- **secrets in tool arguments and results** (a tool that returns `~/.ssh/id_rsa` at runtime)
- **suspicious exfiltration sinks** (ephemeral collectors, tunnels, raw IPs)
- **cross-call toxic flows**: a sensitive read followed by an external send, which only shows up when you watch tool calls across the whole session, not one at a time

Every call is written to a hash-chained JSONL audit log aligned with the IETF Agent Audit Trail draft (genesis, per-call, and a session-close record with a session hash). `verify` re-walks the chain and reports the exact line where any edit, insertion, or deletion breaks it. `--export-aat` emits an EU AI Act Article 12-shaped event log.

### Tamper-proofing the audit log: signing and anchoring

A bare hash chain is tamper-evident, but a local attacker who rewrites the whole log from the start can keep it internally consistent. Two optional layers close that gap, both with Node's built-in crypto, no account, no network:

```bash
# sign every record with a local Ed25519 key (created on first use, kept 0600)
npx @promptguardapp/mcp scan-mcp record ./trace.jsonl --log audit.jsonl --sign

# verify the chain AND the signatures
npx @promptguardapp/mcp scan-mcp verify audit.jsonl --key ~/.promptguard/signing-key.pub.pem

# print an anchor for the chain head, record it somewhere external (a git commit)
npx @promptguardapp/mcp scan-mcp anchor audit.jsonl
# later, prove the log was not rewritten since you anchored it
npx @promptguardapp/mcp scan-mcp verify audit.jsonl --anchor "pg-anchor:v1:..."
```

Three layers, honestly scoped:

- **Hash chain** , catches accidental edits; `verify` breaks at the exact line.
- **Ed25519 signing** , catches a rewrite by anyone *without* your key, even if they repair the chain. The log becomes non-repudiable.
- **External anchoring** , catches a rewrite by someone *with* your key, because the head you recorded elsewhere (a git commit, a written-down token) no longer matches.

Tamper-and-catch in practice: a signed log verifies as "chain intact; signatures valid; head matches the recorded anchor"; edit a single record and `verify` reports "invalid signature on record N" and exits non-zero.

See the whole thing run end to end: [`DEMO.md`](./DEMO.md) is a captured transcript, and `bash scripts/demo.sh` runs it live (catch a runtime toxic flow and a leaked private key, sign and anchor the log, then tamper one record and watch verify break at the exact line).

### Optional: continuous MCP monitoring at session start (Claude Code)

Add a SessionStart hook to `~/.claude/settings.json`. It statically scans your MCP config and runs the always-on rug-pull monitor every time a session begins:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "npx --yes --package=@promptguardapp/mcp -- promptguard-mcp-session-hook"
          }
        ]
      }
    ]
  }
}
```

## Install and use

The simplest setup uses `npx`, so there is no manual install.

### Requirements

- Node.js 20 or later
- Any MCP-compatible client speaking the Model Context Protocol over stdio

### Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS), or the equivalent path on Windows / Linux:

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

Restart Claude Desktop and the PromptGuard tools become available immediately.

### Cursor

Cursor reads MCP servers from `~/.cursor/mcp.json`, with the same config shape:

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

In `~/.continue/config.json`, add an MCP server entry:

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

These accept the standard MCP stdio config. Add a server entry pointing at `npx -y @promptguardapp/mcp` and you are set.

### If node or npx are not on PATH

Common when Node is installed via nvm. Use absolute paths (run `which npx` to find yours):

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

### Using the tools

In any client, ask the model to use a tool by name:

- "Use scan_prompt on this text: ..."
- "Use compress_prompt on this prompt at aggressive level."
- "Use estimate_cost to compare gpt-4o-mini and claude-sonnet-4-6 for this prompt."

The model calls the tool and presents the result inline.

### Claude Code hook (scan every prompt automatically)

If you use [Claude Code](https://docs.claude.com/en/docs/claude-code), install PromptGuard as a `UserPromptSubmit` hook so every prompt you type is scanned before it is sent. No tool call, no per-prompt action. Clean prompts pass through silently; if something is caught, you see an inline warning. The hook never blocks the prompt, it only warns, and you decide whether to retry redacted.

Edit `~/.claude/settings.json` and merge in:

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "npx --yes --package=@promptguardapp/mcp -- promptguard-hook",
            "timeout": 5
          }
        ]
      }
    ]
  }
}
```

The first prompt triggers `npx` to download and cache the package; after that, each prompt is scanned in roughly 50 ms.

### Browser extension

PromptGuard also ships as a browser extension that scans prompts inline on AI chat sites (Claude.ai, ChatGPT, Gemini, Perplexity, You.com, Mistral). It draws wavy underlines under detected secrets and PII and offers one-click redaction, cost estimation, and prompt optimization. Build it from source and load it unpacked:

```bash
npm install
npm run extension:build
```

Then load the `extension/` directory as an unpacked extension in Chrome (`chrome://extensions`, Developer mode, Load unpacked). Full instructions and architecture are in [`extension/README.md`](./extension/README.md).

### VS Code extension

The VS Code extension scans the active document (and re-scans on save), drawing squiggles under matches and listing them in the Problems panel. Build it from source:

```bash
npm install
npm run vscode:build
```

Then press `F5` in VS Code to launch an Extension Development Host with PromptGuard loaded. Details in [`vscode-extension/README.md`](./vscode-extension/README.md).

## Configuration

PromptGuard is intentionally low-config. The behavior you can control:

- **scan_prompt `mode`:** `warn` (default) returns raw matches; `redact` returns a copy of the text with each finding replaced by a `[REDACTED:<type>]` placeholder.
- **compress_prompt `level`:** `light` (filler and verbose phrases only), `medium` (default, also drops connector adverbs and meta-commentary), or `aggressive` (also strips articles after task verbs and rewrites restate-the-question patterns).
- **estimate_cost `model`:** one of `claude-opus-4-7`, `claude-sonnet-4-6`, `claude-haiku-4-5`, `gpt-4o`, `gpt-4o-mini`. Optional `expectedOutputTokens` overrides the default output estimate of `min(inputTokens, 1024)`.

Detection rules live in `src/detectors/rules.ts` (secrets) and `src/detectors/pii-rules.ts` (PII). Each rule carries its own severity, confidence, explanation, and optional validator, so adding or tuning a pattern is a small, local edit.

The VS Code extension adds editor settings (`promptguard.scanOnOpen`, `promptguard.scanOnSave`, `promptguard.showStatusBar`); see its README.

## Development

Clone and run from source:

```bash
git clone https://github.com/KrishOjha1810/promptguard-mcp.git
cd promptguard-mcp
npm install
npm run build
npm test
```

Available scripts:

```bash
npm run dev               # Run the MCP server from source via tsx
npm run build             # Compile TypeScript to dist/
npm test                  # Run the full test suite (vitest)
npm run test:watch        # Run tests in watch mode
npm run typecheck         # Type-check without emitting
npm run extension:build   # Build the browser extension
npm run extension:watch   # Watch and rebuild the extension on changes
npm run extension:icons   # Regenerate PNG icons from icon.svg
npm run extension:zip     # Produce a Chrome Web Store-ready ZIP
npm run vscode:build      # Build the VS Code extension
npm run vscode:watch      # Watch and rebuild the VS Code extension
```

The test suite covers secret detection, universal and US PII, India-specific PII (including the Verhoeff Aadhaar checksum), token counting and cost math across all supported models, and the optimize and compress behavior (including the silent-on-good-prompt path and code-block preservation).

## Privacy

PromptGuard is local-first by design. The MCP server runs in-process over stdio and reaches no network of its own. The browser extension has no backend, no telemetry, no analytics, and no accounts; the only thing it stores is an in-memory list of finding signatures you choose to ignore for the current session, which is discarded when the tab closes. Its whole purpose is to warn you about sensitive content *before* you submit, while the text is still on your machine. The full policy is in [`privacy.md`](./privacy.md), and the source is open so you can verify every claim.

## License

MIT. See [LICENSE](./LICENSE) for the full text.

Copyright (c) 2026 Krish Ojha.
