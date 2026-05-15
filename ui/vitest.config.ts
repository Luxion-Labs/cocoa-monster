import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  test: {
    include: ["src/**/*.spec.{ts,tsx}"],
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    globals: false,
    server: {
      // Inline cocoa-contract so the alias below applies to its
      // transitive imports of compact-runtime — without this, vitest
      // treats the workspace package as external and the rename shim
      // never gets hit.
      deps: {
        inline: [
          /cocoa-contract/,
          /@midnight-ntwrk\//,
        ],
      },
    },
  },
  resolve: {
    alias: {
      "@midnight-ntwrk/compact-runtime": fileURLToPath(
        new URL("./src/lib/compact-runtime-shim.ts", import.meta.url),
      ),
    },
  },
});
