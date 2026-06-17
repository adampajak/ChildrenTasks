import { config as dotenvConfig } from "dotenv";
import { spawn, type ChildProcess } from "node:child_process";

const TEST_PORT = 4322;
let server: ChildProcess | null = null;

export async function setup(): Promise<void> {
  dotenvConfig({ path: ".env.test" });

  server = spawn("npm", ["run", "dev", "--", "--port", String(TEST_PORT)], {
    shell: true,
    stdio: "pipe",
  });

  const baseUrl = `http://localhost:${TEST_PORT}`;

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Astro dev server did not start within 30 s on port ${TEST_PORT}`));
    }, 30_000);

    const poll = setInterval(() => {
      void fetch(baseUrl)
        .then(() => {
          clearInterval(poll);
          clearTimeout(timeout);
          resolve();
        })
        .catch(() => {
          /* server not ready yet */
        });
    }, 500);
  });

  process.env.ASTRO_TEST_URL = baseUrl;
}

export function teardown(): void {
  if (!server) return;
  if (process.platform === "win32" && server.pid !== undefined) {
    spawn("taskkill", ["/F", "/T", "/PID", String(server.pid)], { shell: true });
  } else {
    server.kill("SIGTERM");
  }
  server = null;
}
