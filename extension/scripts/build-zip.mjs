import { execSync } from "child_process";
import { existsSync, unlinkSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const extensionDir = join(__dirname, "..");
const repoRoot = join(extensionDir, "..");
const outZip = join(repoRoot, "promptguard-extension.zip");

if (existsSync(outZip)) {
  unlinkSync(outZip);
  console.log(`removed previous ${outZip}`);
}

// Production ZIP: only the files needed at runtime in the browser.
// Excludes source files, build configs, source maps, and node_modules.
const filesToInclude = [
  "manifest.json",
  "popup.html",
  "dist/content.js",
  "dist/background.js",
  "dist/popup.js",
  "icons/icon-16.png",
  "icons/icon-32.png",
  "icons/icon-48.png",
  "icons/icon-128.png",
];

const cmd = `cd "${extensionDir}" && zip -r "${outZip}" ${filesToInclude.join(" ")}`;
execSync(cmd, { stdio: "inherit" });

console.log(`\nProduction ZIP ready: ${outZip}`);
console.log("Upload this file in the Chrome Web Store Developer Dashboard.");
