import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  webServer: { command: "pnpm dev", url: "http://localhost:3000", reuseExistingServer: !process.env.CI, timeout: 120_000 },
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
      use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
    },
  ],
});
