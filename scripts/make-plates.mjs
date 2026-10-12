// One-off: converted src/assets/plates/*.png to WebP (same pixel size) with sharp. Kept for provenance.
import sharp from "sharp";
import { readdirSync, statSync, unlinkSync, renameSync } from "node:fs";
const dir = new URL("../apps/web/src/assets/plates/", import.meta.url).pathname.replace(/^\/(\w:)/, "$1");
let before = 0, after = 0;
for (const f of readdirSync(dir).filter((f) => f.endsWith(".png"))) {
  const src = dir + f, out = dir + f.replace(/\.png$/, ".webp");
  before += statSync(src).size;
  const a = await sharp(src).metadata();
  await sharp(src).webp({ quality: +process.env.Q || 82, effort: 6 }).toFile(out);
  const b = await sharp(out).metadata();
  if (a.width !== b.width || a.height !== b.height) throw new Error("size changed " + f);
  after += statSync(out).size;
  console.log(f, a.width + "x" + a.height, statSync(src).size, "->", statSync(out).size);
}
console.log("before", before, "after", after);
