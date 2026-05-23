import { build, context } from "esbuild";

const watch = process.argv.includes("--watch");

const entries = ["src/content.ts", "src/background.ts", "src/popup.ts"];

const config = {
  entryPoints: entries,
  outdir: "dist",
  bundle: true,
  platform: "browser",
  format: "iife",
  target: ["chrome120", "firefox120"],
  sourcemap: true,
  logLevel: "info",
  minify: false,
};

if (watch) {
  const ctx = await context(config);
  await ctx.watch();
  console.log("[PromptGuard extension] watching for changes...");
} else {
  await build(config);
  console.log("[PromptGuard extension] built dist/");
}
