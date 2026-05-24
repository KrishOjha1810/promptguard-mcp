#!/usr/bin/env node
// Thin shim that imports the canonical hook from the built dist/ folder.
// The actual logic lives in src/hook.ts. This file exists so a local
// settings.json can point at the script before the npm package is
// republished with the promptguard-hook bin entry.
import "../dist/hook.js";
