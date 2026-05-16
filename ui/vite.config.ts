import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import wasm from "vite-plugin-wasm";
import topLevelAwait from "vite-plugin-top-level-await";
import { fileURLToPath } from "node:url";

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
    alias: {
      "@": "/src",
      // The pinned compact toolchain emits checkRuntimeVersion('0.16.0'),
      // which renamed `constructorContext` → `createConstructorContext`.
      // midnight-js-contracts@2.x still imports the old name. The shim
      // re-exports the new runtime and adds the old names back so the
      // dapp can deploy/call markets without bumping the whole stack.
      "@midnight-ntwrk/compact-runtime": fileURLToPath(
        new URL("./src/lib/compact-runtime-shim.ts", import.meta.url),
      ),
      // levelPrivateStateProvider → abstract-level → require('events').
      // Vite externalizes Node built-ins for browser builds, leaving
      // EventEmitter undefined and crashing every `class extends` site
      // at module init. Aliasing to the npm `events` polyfill resolves it
      // without needing vite-plugin-node-polyfills (which injects a
      // `global` shim that interferes with Lace's window.midnight detection).
      events: "events/",
    },
    dedupe: ["react", "react-dom"],
  },
});
