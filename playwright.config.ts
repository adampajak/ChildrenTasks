import { defineConfig, devices } from "@playwright/test";
import { readFileSync } from "node:fs";

// Load .dev.vars (Cloudflare Workers secrets file) so TEST_EMAIL / TEST_PASSWORD
// are available to test workers — the file is not auto-loaded by Node or Playwright.
try {
  for (const line of readFileSync(".dev.vars", "utf-8").split("\n")) {
    const eq = line.indexOf("=");
    if (eq > 0 && !line.startsWith("#")) {
      const key = line.slice(0, eq).trim();
      const value = line.slice(eq + 1).trim();
      process.env[key] ??= value;
    }
  }
} catch {
  // .dev.vars absent — rely on env vars set in the shell / CI secrets
}

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  use: {
    baseURL: process.env.BASE_URL ?? "http://localhost:4321",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "setup",
      testMatch: /.*\.setup\.ts/,
    },
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        storageState: ".auth/user.json",
      },
      dependencies: ["setup"],
    },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:4321",
    reuseExistingServer: !process.env.CI,
  },
});
