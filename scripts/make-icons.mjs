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

// The notification badge: Android draws only its alpha, in one colour, so the opaque square above shows as a
// solid block. Here the slip is a white silhouette with its print and tick cut through.
const badge = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 64 64">
  <mask id="m"><g transform="translate(-3.5 -1) scale(1.1)"><g transform="rotate(-6 32 32)">
    <path d="M15 13 L19 9 L23 13 L27 9 L31 13 L35 9 L39 13 L43 9 L47 13 L49 11 L49 57 L15 57 Z" fill="#fff" stroke="#fff" stroke-width="2.2" stroke-linejoin="round"/>
    <rect x="20" y="20" width="24" height="5" rx="1" fill="#000"/>
    <rect x="20" y="29" width="17" height="3" rx="1" fill="#000"/>
    <path d="M22.5 46.2c1.4.7 2.8 2.3 4.1 4.4.3.4.8.4 1 0 2.4-4.6 5.6-8.4 10.4-11.8" fill="none" stroke="#000" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/>
  </g></g></mask>
  <rect width="64" height="64" fill="#fff" mask="url(#m)"/>
</svg>`;
await sharp(Buffer.from(badge)).png().toFile(out("badge-96.png").pathname.replace(/^\/(\w:)/, "$1"));
