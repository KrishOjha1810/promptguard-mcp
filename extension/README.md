# PromptGuard Browser Extension

> Inline secret + PII safety for prompts on Claude.ai and ChatGPT.com. Runs entirely on your machine, no telemetry, no signup, MIT licensed.

## What it does

- **Inline detection** of 22 patterns of sensitive data including AWS, GitHub, OpenAI, Anthropic, Stripe, Slack, Google secrets, plus universal PII (email, phone, credit card with Luhn check, US SSN) and India-specific PII (Aadhaar with Verhoeff, PAN, GSTIN, UPI, IFSC, mobile)
- **Visual overlay** in the bottom-right corner of the page showing finding count, color-coded by severity. Click to open a panel listing every finding with one-line explanations
- **One-click Redact and Ignore** actions per finding, plus a Redact-all bulk action
- **Per-character wavy underlines** drawn directly under the matched characters in the prompt input itself (Grammarly-style)
- **Popup with cost estimator** (~tokens and ~dollar estimate across Claude Opus / Sonnet / Haiku, GPT-4o, GPT-4o-mini)
- **Optimize and Compress** actions in the popup that rewrite the prompt to be tighter, with Apply buttons that update the prompt in place
- **Compress-and-send flags** that shorten a prompt at submit time and send the shortened version (see below)

All analysis runs locally. The prompt text never leaves your machine through PromptGuard.

## Compress-and-send flags

Start a prompt with a flag and PromptGuard tightens it the moment you press Enter, then sends the shortened version instead of what you typed. A small receipt slides in (bottom-left) showing how many tokens you saved and exactly what was sent, with a toggle to compare against what you typed.

| Flag | Level | What it does |
|---|---|---|
| `pg ` | medium (safe) | Strips filler, politeness, hedging, and meta-commentary. Meaning preserved on most prompts. |
| `pg! ` | caveman (lossy) | Everything above, plus drops all articles (the/a/an) and more. Telegraphic and can shift meaning. Use when you are rate-limited, not for important work. |

`promptguard ` and `prompt-guard ` are aliases for the safe `pg ` level.

```
You type:   pg Could you please write a function that validates the emails in this list
Sent:       Write a function that validates the emails in this list
Receipt:    ✓ Tightened & sent — saved 6 tokens (24%)
```

Notes and limits, stated plainly:

- The flag itself is always stripped before anything is sent. A bare `pg ` with no prompt after it is treated as ordinary text, not a trigger.
- The everyday `pg ` flag never reaches the lossy caveman level. Caveman is only ever triggered by the separate, explicit `pg! `, so you cannot mangle meaning by accident.
- Fully automatic send only works in the extension, because the extension owns the input box and can swap its contents before the site sends it. The Claude Code prompt hook supports the same `pg` / `pg!` flags, but because the hook API can only add context or block a prompt (never replace it), there it compresses, copies the short prompt to your clipboard, and blocks the long one for a one-keystroke paste.
- Sending is done by clicking the site's send button (or, as a fallback, replaying Enter). The text-replacement and send-button heuristics are tested on Claude.ai and ChatGPT; if a site changes its DOM, the worst case is that your already-compressed text sits in the box and you press Enter once yourself.

## Build

From the repo root:

```bash
npm install
npm run extension:build
```

This bundles `extension/src/*.ts` into `extension/dist/*.js` using esbuild.

For dev mode with file watching:

```bash
npm run extension:watch
```

## Load locally in Chrome

1. Open `chrome://extensions`
2. Toggle **Developer mode** in the top right
3. Click **Load unpacked**
4. Pick the `extension/` directory in this repo
5. The PromptGuard icon appears in your toolbar

After loading, visit https://claude.ai or https://chatgpt.com. The content script runs on page load; type a fake AWS key into the prompt to see the underlines and the bottom-right pill.

## Load locally in Firefox

Requires Firefox 120 or later (for Manifest V3 service worker support).

1. Open `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on...**
3. Pick `extension/manifest.json`
4. The extension loads until you close Firefox

For permanent installation in Firefox, the extension needs to be submitted to addons.mozilla.org. That is the v0.2.7 work.

## How it works (technical)

- **Content script** runs on claude.ai / chatgpt.com pages. It finds the largest visible textarea or `contenteditable`, attaches an `input` listener with a 300 ms debounce, and runs the same `scanText` engine that the MCP server uses.
- **Visual overlay** lives in a Shadow DOM rooted on `<body>` so the host site's CSS cannot break it.
- **Underline overlay** is a transparent absolutely-positioned div sitting over the prompt input. It copies the input's computed styles (font, padding, line-height, etc.) so text wraps at identical positions, then renders each finding's substring in a span with `text-decoration: underline wavy <severity-color>`. The text itself is transparent. `pointer-events: none` so clicks and typing pass through to the real input.
- **Popup** talks to the content script via `chrome.runtime.sendMessage` (`get_text` and `set_text` types) so Optimize and Compress actions can read and replace the prompt without sharing process state.

## Folder layout

```
extension/
├── manifest.json              MV3 manifest with Firefox compatibility block
├── popup.html                 popup markup
├── src/
│   ├── content.ts             page-side: finds the input, scans, drives overlays, compress-on-send
│   ├── background.ts          service worker: lifecycle + message router
│   ├── overlay.ts             bottom-right pill + findings panel (shadow DOM)
│   ├── underline-overlay.ts   transparent overlay drawing wavy underlines
│   ├── compress-flag.ts       parses the pg / pg! flags and produces the text to send
│   ├── compress-toast.ts      bottom-left "tightened & sent" receipt (shadow DOM)
│   └── popup.ts               popup behavior: cost, optimize, compress, apply
├── dist/                      build output (gitignored)
├── icons/                     reserved for v0.2.7 store listing
├── tsconfig.json
├── build.mjs                  esbuild config
└── README.md
```

## Versioning

The extension version is independent of the npm-published MCP server version. Both currently start at 0.0.x. Manifest version is the source of truth for what is loaded in browsers.

## Roadmap

See `docs/10-v2-plan.md` for the full v0.2.x roadmap. Short version:

| Version | State | What |
|---|---|---|
| v0.2.0 | done | Scaffold loads, popup confirms active |
| v0.2.1 | done | Content script scans on input, logs to console |
| v0.2.2 | done | Pill + panel visual overlay |
| v0.2.3 | done | Redact + Ignore + Redact-all actions, UI polish |
| v0.2.4 | done | Popup with cost + optimize + compress |
| v0.2.5 | done | Per-character wavy underlines on the input |
| v0.2.6 | done | Firefox compatibility |
| v0.2.7 | done | Compress-and-send flags (`pg` / `pg!`) with receipt |
| v0.2.8 | next | Chrome Web Store listing prep + submission |
