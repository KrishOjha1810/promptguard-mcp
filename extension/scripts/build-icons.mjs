import sharp from "sharp";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const svgPath = join(__dirname, "../icons/icon.svg");
const outDir = join(__dirname, "../icons");

const svg = readFileSync(svgPath);
const sizes = [16, 32, 48, 128];

for (const size of sizes) {
  const out = join(outDir, `icon-${size}.png`);
  await sharp(svg).resize(size, size).png().toFile(out);
  console.log(`generated ${out}`);
}
