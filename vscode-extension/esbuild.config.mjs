import { build, context } from "esbuild";

const watch = process.argv.includes("--watch");

const config = {
  entryPoints: ["src/extension.ts"],
  outfile: "dist/extension.js",
  bundle: true,
  external: ["vscode"],
  platform: "node",
  format: "cjs",
  target: "node18",
  sourcemap: true,
  logLevel: "info",
  minify: false,
};

if (watch) {
  const ctx = await context(config);
  await ctx.watch();
  console.log("[PromptGuard VS Code] watching for changes...");
} else {
  await build(config);
  console.log("[PromptGuard VS Code] built dist/extension.js");
}
