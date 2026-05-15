import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import wasm from "vite-plugin-wasm";
import topLevelAwait from "vite-plugin-top-level-await";
import { nodePolyfills } from "vite-plugin-node-polyfills";
import { fileURLToPath } from "node:url";

export default defineConfig({
  cacheDir: "./.vite",
  build: {
    target: "esnext",
  },
  plugins: [
    react(),
    wasm(),
    topLevelAwait(),
    // levelPrivateStateProvider → abstract-level → require('events')
    // and friends; without this, EventEmitter resolves to undefined and
    // every class extending it dies at module init. The polyfill set is
    // narrow (just what midnight-js + level transitively need) so we
    // keep the bundle from ballooning.
    nodePolyfills({
      include: ["events", "buffer", "process", "util"],
      globals: { Buffer: true, process: true, global: true },
    }),
  ],
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
    },
    dedupe: ["react", "react-dom"],
  },
});
