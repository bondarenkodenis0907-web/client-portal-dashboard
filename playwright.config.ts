import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  workers: 1,
  retries: 0,
  timeout: 60_000,
  use: {
    baseURL: "http://127.0.0.1:3010",
    viewport: { width: 1440, height: 1000 },
    launchOptions: { channel: process.env.PLAYWRIGHT_CHANNEL || undefined },
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run start -- --port 3010",
    url: "http://127.0.0.1:3010",
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
