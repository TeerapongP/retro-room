import { defineConfig, devices } from "@playwright/test";
import firebaseE2E from "./.firebase.e2e.json";

const backendMode = process.env.RETRO_ROOM_E2E_MODE === "emulator" ? "emulator" : "mock";
const devPort = backendMode === "emulator" ? 3101 : 3100;
const devUrl = `http://127.0.0.1:${devPort}`;

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: backendMode === "emulator" ? "**/host-selection-live.spec.ts" : "**/*.spec.ts",
  testIgnore: backendMode === "mock" ? "**/host-selection-live.spec.ts" : undefined,
  webServer: {
    command: `node scripts/run-next-dev.mjs ${backendMode} --hostname 127.0.0.1 --port ${devPort}`,
    url: devUrl,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      RETRO_ROOM_PLAYWRIGHT: "true",
      ...(backendMode === "emulator" ? {
        NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_URL: `http://127.0.0.1:${firebaseE2E.emulators.auth.port}`,
        NEXT_PUBLIC_FIREBASE_FIRESTORE_EMULATOR_PORT: String(firebaseE2E.emulators.firestore.port),
        NEXT_PUBLIC_FIREBASE_FUNCTIONS_EMULATOR_PORT: String(firebaseE2E.emulators.functions.port),
      } : {}),
    },
  },
  outputDir: backendMode === "emulator"
    ? "./artifacts/playwright/test-results-emulator"
    : "./artifacts/playwright/test-results",
  timeout: 60_000,
  retries: 1,
  workers: 1,
  reporter: [
    ["html", { outputFolder: `./artifacts/playwright/report-${backendMode}`, open: "never" }],
    ["list"],
  ],

  use: {
    baseURL: devUrl,
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
