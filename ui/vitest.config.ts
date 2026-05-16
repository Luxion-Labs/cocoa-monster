import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    include: ["src/**/*.spec.{ts,tsx}"],
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    globals: false,
    server: {
      deps: {
        // Inline workspace + midnight-js packages so vitest processes their
        // imports through vite's transform pipeline (resolves the contract
        // package's `@midnight-ntwrk/compact-runtime` import correctly).
        inline: [/cocoa-contract/, /@midnight-ntwrk\//],
      },
    },
  },
});
