// Generated icons: the app's wordmark (Carlito 700, --ink on --ground, see TopBar/pass.css) rendered with Playwright.
import { chromium } from "playwright-core";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const font = createRequire(import.meta.url).resolve("@fontsource/carlito/files/carlito-latin-700-normal.woff2", { paths: ["apps/web"] });
const out = new URL("../apps/web/public/", import.meta.url);
const html = (size, scale) => `<style>@font-face{font-family:C;src:url(data:font/woff2;base64,${readFileSync(font).toString("base64")})}
html,body{margin:0}body{width:${size}px;height:${size}px;background:#fcfcfc;display:grid;place-items:center}
p{margin:0;font:700 ${Math.round(size * scale)}px/1 C;color:#111;letter-spacing:-0.01em}</style><p>toodoo</p>`;
const jobs = [["icon-192.png", 192, 0.25], ["icon-512.png", 512, 0.25], ["icon-maskable-512.png", 512, 0.19], ["apple-touch-icon.png", 180, 0.25]];
const browser = await chromium.launch({ channel: "chrome" });
for (const [name, size, scale] of jobs) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(html(size, scale));
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: new URL(name, out).pathname.replace(/^\/(\w:)/, "$1") });
  await page.close();
}
await browser.close();
