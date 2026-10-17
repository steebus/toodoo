import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";

export default defineConfig(({ mode }) => {
  // dev:cloud: this front end on the production backend, signed in through prod's WorkOS client from the root .env.
  // Set on process.env because it beats every .env file, so .env.local (the local backend) can't win.
  if (mode === "cloud") {
    const env = parseEnv(readFileSync(new URL("../../.env", import.meta.url), "utf8"));
    process.env.CONVEX_URL = "https://valiant-pelican-789.convex.cloud";
    process.env.VITE_WORKOS_CLIENT_ID = env.WORKOS_CLIENT_ID;
  }
  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: "prompt", // a new version waits for the next launch: autoUpdate reloaded the page mid-use
        includeAssets: ["apple-touch-icon.png", "favicon.svg", "badge-96.png"],
        manifest: {
          name: "toodoo", short_name: "toodoo", display: "standalone", start_url: "/", scope: "/",
          theme_color: "#fcfcfc", background_color: "#fcfcfc", // --ground in styles/tokens.css
          icons: [
            { src: "icon-192.png", sizes: "192x192", type: "image/png" },
            { src: "icon-512.png", sizes: "512x512", type: "image/png" },
            { src: "icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
          ],
          // Installed from Chrome on Android, toodoo shows in every app's share sheet (see lib/share.ts).
          share_target: { action: "/share", method: "GET", params: { title: "title", text: "text", url: "url" } },
        },
        workbox: { globPatterns: ["**/*.{js,css,html,woff2,webp,png}"], navigateFallback: "/index.html", importScripts: ["/push-sw.js"] }, // push-sw: due reminders
      }),
    ],
    envDir: "../..",
    envPrefix: ["VITE_", "CONVEX_URL"],
    resolve: {
      alias: {
        "@shared": fileURLToPath(new URL("../../shared", import.meta.url)),
        "@convex": fileURLToPath(new URL("../../convex", import.meta.url)),
      },
    },
    server: { fs: { allow: ["../.."] } },
    test: { environment: "jsdom", setupFiles: ["./src/test-setup.ts"] },
  };
});
