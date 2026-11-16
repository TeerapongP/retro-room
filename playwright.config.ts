import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  outputDir: "./artifacts/playwright/test-results",
  timeout: 60_000,
  retries: 1,
  workers: 1,
  reporter: [
    ["html", { outputFolder: "./artifacts/playwright/report", open: "never" }],
    ["list"],
  ],

  use: {
    baseURL: "http://localhost:3000",
    screenshot: "on",
    video: "on",
    trace: "on",
    headless: true,
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile",
      use: { ...devices["iPhone 14"] },
    },
  ],
});
