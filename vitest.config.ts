import { defineConfig } from "vitest/config";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  test: {
    environment: "node",
    include: ["packages/**/*.test.ts", "apps/**/*.test.ts"]
  },
  resolve: {
    conditions: ["source"],
    alias: {
      "@ccli/agent-core": fileURLToPath(new URL("./packages/agent-core/src/index.ts", import.meta.url)),
      "@ccli/experience": fileURLToPath(new URL("./packages/experience/src/index.ts", import.meta.url)),
      "@ccli/memory": fileURLToPath(new URL("./packages/memory/src/index.ts", import.meta.url)),
      "@ccli/methodology": fileURLToPath(new URL("./packages/methodology/src/index.ts", import.meta.url)),
      "@ccli/policy": fileURLToPath(new URL("./packages/policy/src/index.ts", import.meta.url)),
      "@ccli/product-ui": fileURLToPath(new URL("./packages/product-ui/src/index.ts", import.meta.url)),
      "@ccli/providers": fileURLToPath(new URL("./packages/providers/src/index.ts", import.meta.url)),
      "@ccli/review": fileURLToPath(new URL("./packages/review/src/index.ts", import.meta.url)),
      "@ccli/session": fileURLToPath(new URL("./packages/session/src/index.ts", import.meta.url)),
      "@ccli/templates": fileURLToPath(new URL("./packages/templates/src/index.ts", import.meta.url)),
      "@ccli/tools": fileURLToPath(new URL("./packages/tools/src/index.ts", import.meta.url))
    }
  }
});
