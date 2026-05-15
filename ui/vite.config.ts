import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import wasm from "vite-plugin-wasm";
import topLevelAwait from "vite-plugin-top-level-await";

export default defineConfig({
  cacheDir: "./.vite",
  build: {
    target: "esnext",
  },
  plugins: [react(), wasm(), topLevelAwait()],
  optimizeDeps: {
    esbuildOptions: {
      target: "esnext",
      supported: { "top-level-await": true },
    },
  },
  resolve: {
    alias: { "@": "/src" },
    dedupe: ["react", "react-dom"],
  },
});
