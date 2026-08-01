import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Only run TypeScript tests in src/; never pick up compiled test files from dist/.
    include: ["src/**/*.test.ts"],
    exclude: ["dist/**", "node_modules/**"],
  },
});
