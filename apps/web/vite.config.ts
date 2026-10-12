import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["apple-touch-icon.png"],
      manifest: {
        name: "toodoo", short_name: "toodoo", display: "standalone", start_url: "/", scope: "/",
        theme_color: "#fcfcfc", background_color: "#fcfcfc", // --ground in styles/tokens.css
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: { globPatterns: ["**/*.{js,css,html,woff2,webp,png}"], navigateFallback: "/index.html" },
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
});
