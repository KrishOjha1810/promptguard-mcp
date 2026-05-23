# PromptGuard Browser Extension

> v0.2.0 scaffold. The extension currently loads in Chrome / Firefox and shows a popup confirming it is active. Real detection (inline secret + PII scanning on Claude.ai and ChatGPT.com) lands in v0.2.1.

## Build

From the repo root:

```bash
npm run extension:build
```

This bundles `extension/src/{content,background,popup}.ts` into `extension/dist/*.js` using esbuild.

For dev mode with file watching:

```bash
npm run extension:watch
```

## Load locally in Chrome

1. Open `chrome://extensions`
2. Toggle **Developer mode** in the top right
3. Click **Load unpacked**
4. Pick the `extension/` directory in this repo
5. The PromptGuard icon should appear in your toolbar

After loading, visit https://claude.ai or https://chatgpt.com. The content script will run on page load. Open the browser console and you should see a log line like `[PromptGuard v0.0.1] loaded on claude.ai. Detection arrives in v0.2.1.`

Click the PromptGuard toolbar icon to open the popup. It will say "Active" and show the version.

## Load locally in Firefox

1. Open `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on...**
3. Pick `extension/manifest.json`
4. The extension loads until you close Firefox

## Folder layout

```
extension/
├── manifest.json          MV3 manifest
├── popup.html             popup markup
├── src/
│   ├── content.ts         injected into claude.ai / chatgpt.com pages
│   ├── background.ts      service worker (lifecycle + message routing)
│   └── popup.ts           popup interaction
├── dist/                  build output (gitignored)
├── icons/                 reserved for future icon assets
├── tsconfig.json
├── build.mjs              esbuild config
└── README.md
```

## Roadmap

See `docs/10-v2-plan.md` for the v0.2.x roadmap. Short version:

| Version | What |
|---|---|
| v0.2.0 (now) | Scaffold loads, popup says active |
| v0.2.1 | Content script finds the prompt textarea and scans on input |
| v0.2.2 | Inline overlay with finding count + side card |
| v0.2.3 | Per-character underline colors and one-click redact |
| v0.2.4+ | Cost estimate, optimize, compress, Chrome Web Store listing |
