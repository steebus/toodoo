// Generated icons: the thermal-paper slip the app's tasks are printed on (apps/web/public/favicon.svg),
// on the rails' ink for the installed app, rendered with sharp. Run from the repo root.
import sharp from "sharp";
import { readFileSync } from "node:fs";

const out = (name) => new URL(`../apps/web/public/${name}`, import.meta.url);
const slip = readFileSync(out("favicon.svg"), "utf8").replace(/^<svg[^>]*>|<\/svg>\s*$/g, "");
// scale: how much of the square the slip's 64 units take (maskable keeps to the middle 80%).
const square = (size, scale, round) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="${round ? 14 : 0}" fill="#2b2d31"/>
  <g transform="translate(${32 - 32 * scale} ${32 - 32 * scale}) scale(${scale})">${slip}</g>
</svg>`;
const jobs = [["icon-192.png", 192, 0.92, false], ["icon-512.png", 512, 0.92, false], ["icon-maskable-512.png", 512, 0.72, false], ["apple-touch-icon.png", 180, 0.86, false]];
for (const [name, size, scale, round] of jobs) {
  await sharp(Buffer.from(square(size, scale, round))).png().toFile(out(name).pathname.replace(/^\/(\w:)/, "$1"));
}
