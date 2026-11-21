import { defineConfig } from "@playwright/test";
import { resolve } from "node:path";
export default defineConfig({
  testDir: "./tests",
  workers: 1,
  fullyParallel: false,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:3011",
    headless: true,
    channel: process.env.BROWSER_CHANNEL || "msedge",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "node backend/src/server.js",
    url: "http://127.0.0.1:3011",
    reuseExistingServer: false,
    env: { PORT: "3011", DB_PATH: resolve("backend/data/browser-test.sqlite") },
  },
});
