/// <reference types="vitest/config" />
import path from "node:path";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  // Optional, for isolated QA runs next to a normal dev server:
  // IRIS_API_URL points the proxy at another backend; IRIS_VITE_CACHE keeps a separate dependency cache.
  cacheDir: process.env.IRIS_VITE_CACHE ?? "node_modules/.vite",
  server: {
    port: 5180,
    proxy: { "/api": { target: process.env.IRIS_API_URL ?? "http://127.0.0.1:8000", changeOrigin: true } },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    css: false,
  },
});
