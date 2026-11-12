import { deleteApp, getApps } from "firebase/app";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

async function loadClient() {
  vi.resetModules();
  return import("@/lib/firebase/client");
}

beforeEach(async () => {
  await Promise.all(getApps().map((app) => deleteApp(app)));
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(getApps().map((app) => deleteApp(app)));
});

describe("emulator mode guard", () => {
  it(`should use the demo project and never the configured project when emulator mode is on`, async () => {
    vi.stubEnv("NEXT_PUBLIC_USE_FIREBASE_EMULATOR", "true");
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_PROJECT_ID", "real-production-project");
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_API_KEY", "real-production-key");
    const client = await loadClient();

    const auth = client.getFirebaseAuth();

    expect(auth.app.options.projectId).toBe("demo-retro-room");
    expect(auth.app.options.apiKey).not.toBe("real-production-key");
    expect(client.isFirebaseEmulatorEnabled()).toBe(true);
  });

  it(`should use the configured project when emulator mode is off`, async () => {
    vi.stubEnv("NEXT_PUBLIC_USE_FIREBASE_EMULATOR", "");
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_PROJECT_ID", "configured-project");
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_API_KEY", "configured-key");
    const client = await loadClient();

    const auth = client.getFirebaseAuth();

    expect(auth.app.options.projectId).toBe("configured-project");
    expect(client.isFirebaseEmulatorEnabled()).toBe(false);
  });

  it(`should refuse to start when emulator mode is requested in a production build`, async () => {
    vi.stubEnv("NEXT_PUBLIC_USE_FIREBASE_EMULATOR", "true");
    vi.stubEnv("NODE_ENV", "production");
    const client = await loadClient();

    expect(() => client.getFirebaseAuth()).toThrow(/not allowed in a production build/);
    expect(() => client.getFirebaseFirestore()).toThrow(/not allowed in a production build/);
    expect(client.isFirebaseEmulatorEnabled()).toBe(false);
  });

  it(`should refuse emulator mode when the page is not served from localhost`, async () => {
    vi.stubEnv("NEXT_PUBLIC_USE_FIREBASE_EMULATOR", "true");
    vi.stubGlobal("window", { location: { hostname: "retro.example.com" } });
    const client = await loadClient();

    expect(() => client.getFirebaseAuth()).toThrow(/only allowed on localhost/);
    vi.unstubAllGlobals();
  });
});
