# PromptGuard for VS Code

Scan documents for AI-prompt secrets, API keys, and PII. Local, free, open source.

> v0.0.1 starter scaffold. Manual scan + diagnostics + status bar work. Live scanning, code actions for one-click redact, and Marketplace publication land in v0.3.x.

## What it does

PromptGuard scans the current document (and re-scans on save) for 23 patterns of sensitive data including AWS / GitHub / OpenAI / Anthropic / Stripe / Slack / npm tokens, credit cards (Luhn validated), US SSNs, Indian Aadhaar (Verhoeff validated), PAN, GSTIN, UPI handles, IFSC codes, emails, and phone numbers.

When something is found:

- A squiggly underline appears under the matched text in the editor (color matches severity: red for critical, yellow for medium, blue for low)
- The Problems panel lists every finding with the rule name and a one-line explanation
- The status bar shows the finding count for the active document

Everything runs locally. No prompt content leaves your machine.

## Commands

- **PromptGuard: Scan current document** — runs the scanner manually on the active editor
- **PromptGuard: Scan selection** — scans only the selected text, shows results in a modal
- **PromptGuard: Clear all PromptGuard markers** — removes all squiggles from all open documents

## Settings

- `promptguard.scanOnOpen` (boolean, default `true`) — scan a document when it is opened
- `promptguard.scanOnSave` (boolean, default `true`) — re-scan when the document is saved
- `promptguard.showStatusBar` (boolean, default `true`) — show the finding-count status bar item

## Build

From the repo root:

```bash
npm install
npm run vscode:build
```

This bundles `vscode-extension/src/extension.ts` into `vscode-extension/dist/extension.js` using esbuild.

For dev mode with file watching:

```bash
npm run vscode:watch
```

## Run locally for testing

1. Open the repo in VS Code: `code /Users/krishojha/Desktop/promptguard`
2. Press `F5` to launch a new Extension Development Host window with PromptGuard loaded
3. In the new window, open any file containing test secrets (or paste some yourself)
4. Squiggly underlines should appear under matched text

Or install the .vsix file manually:

```bash
# After packaging
code --install-extension promptguard-0.0.1.vsix
```

(Packaging to .vsix requires `@vscode/vsce` which is not installed yet; that is v0.3.x prep work.)

## Architecture

Same detection engine as the MCP server and the browser extension. The `scanText` function in `src/detectors/secrets.ts` is the single source of truth, imported via relative path and bundled by esbuild.

VS Code-specific:
- `vscode.languages.createDiagnosticCollection` for the squiggly underlines
- `vscode.window.createStatusBarItem` for the count indicator
- `onDidOpenTextDocument` and `onDidSaveTextDocument` for auto-scan
- `vscode.DiagnosticSeverity` mapping: critical → Error, high → Warning, medium → Information, low → Hint

## Roadmap

| Version | What |
|---|---|
| v0.0.1 (now) | Manual scan, scan-on-save, diagnostics, status bar |
| v0.0.2 | Live scan on edit (debounced) |
| v0.0.3 | Code Actions: one-click redact, ignore for session |
| v0.0.4 | Workspace-wide scan ("PromptGuard: Scan all files") |
| v0.0.5 | Multi-language file filtering (only .md, .txt, .py, etc.) |
| v0.1.0 | Publish to VS Code Marketplace |

## License

MIT. See [LICENSE](../LICENSE) for the full text.
