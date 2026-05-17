import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import wasm from "vite-plugin-wasm";
import topLevelAwait from "vite-plugin-top-level-await";
import { nodePolyfills } from "vite-plugin-node-polyfills";

// Vite proxies `/proof-server/*` to the docker proof-server brought up
// by `just dev`. Override with VITE_PROOF_SERVER_UPSTREAM to point at a
// different host (e.g. a remote proof-server you control).
const proofServerUpstream =
  process.env.VITE_PROOF_SERVER_UPSTREAM ?? "http://localhost:6300";

export default defineConfig({
  cacheDir: "./.vite",
  build: {
    target: "esnext",
  },
  server: {
    allowedHosts: [""],
    // Browser → vite (same-origin, no CORS) → preprod proof-server. The

    // proof server doesn't send Access-Control-Allow-Origin, so the
    // dapp can't hit it directly from the browser; the proxy strips
    // origin enforcement.
    proxy: {
      "/proof-server": {
        target: proofServerUpstream,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/proof-server/, ""),
      },
      "/midnight-artifacts": {
        target: "https://midnight-s3-fileshare-dev-eu-west-1.s3.eu-west-1.amazonaws.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/midnight-artifacts/, ""),
      },
    },
  },
  plugins: [
    react(),
    wasm(),
    topLevelAwait(),
    // levelPrivateStateProvider + abstract-level need Node built-ins at
    // runtime: crypto (createHash/timingSafeEqual), events (EventEmitter),
    // util, buffer. We narrow the polyfill set to exactly that and DO
    // NOT inject the `global` shim — that interferes with Lace's
    // window.midnight content-script injection.
    nodePolyfills({
      include: ["crypto", "events", "util", "buffer", "process", "stream"],
      // crypto-browserify → randombytes references `global`; util/assert
      // chain references `process`; midnight-js calls `Buffer.*`. All
      // three are real runtime needs. The earlier hypothesis that
      // `global: true` broke Lace turned out to be wrong — that was an
      // API version mismatch (3.x enable() vs 4.x connect()).
      globals: { Buffer: true, process: true, global: true },
      protocolImports: true,
    }),
  ],
  optimizeDeps: {
    include: ["isomorphic-ws"],
    esbuildOptions: {
      target: "esnext",
      supported: { "top-level-await": true },
    },
  },
  resolve: {
    alias: {
      "@": "/src",
      "isomorphic-ws": "isomorphic-ws/browser.js",
      // levelPrivateStateProvider → abstract-level → require('events').

      // Vite externalizes Node built-ins for browser builds, leaving
      // EventEmitter undefined and crashing every `class extends` site
      // at module init. Aliasing to the npm `events` polyfill resolves
      // it without injecting the global shim that vite-plugin-node-polyfills
      // would (which broke Lace's window.midnight detection).
      events: "events/",
    },
    dedupe: ["react", "react-dom"],
  },
});
