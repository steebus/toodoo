import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react(), tailwindcss()],
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
