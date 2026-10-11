import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Separate from vite.config.ts, whose root is site/: the suite covers the client package and the site's logic.
export default defineConfig({
  resolve: {
    alias: {
      "@bitsocialforge/forge-images-client": fileURLToPath(new URL("./packages/client/src/index.ts", import.meta.url)),
    },
  },
  test: {
    include: ["packages/*/test/**/*.test.ts", "site/src/**/*.test.{ts,tsx}"],
  },
});
