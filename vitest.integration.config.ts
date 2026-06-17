import { defineConfig } from "vitest/config";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  test: {
    name: "integration",
    environment: "node",
    env: { TZ: "Europe/Warsaw" },
    include: ["tests/integration/**/*.test.ts"],
    globalSetup: ["tests/integration/global.setup.ts"],
    testTimeout: 30000,
    passWithNoTests: true,
  },
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
});
