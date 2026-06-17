import { test as setup, expect } from "@playwright/test";
import { fileURLToPath } from "node:url";

const authFile = fileURLToPath(new URL("../.auth/user.json", import.meta.url));

setup("authenticate", async ({ page }) => {
  const email = process.env.TEST_EMAIL;
  const password = process.env.TEST_PASSWORD;
  if (!email || !password) {
    throw new Error("TEST_EMAIL and TEST_PASSWORD must be set in .dev.vars or the environment");
  }

  await page.goto("/auth/signin");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("/");
  await expect(page).toHaveURL("/");
  await page.context().storageState({ path: authFile });
});
