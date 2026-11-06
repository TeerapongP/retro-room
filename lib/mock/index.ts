import { createMockBackend, MOCK_STATE_KEY, type MockBackend } from "./backend";

const LOCAL_HOSTNAMES = ["localhost", "127.0.0.1"];

type GlobalWithMock = typeof globalThis & { __retroRoomMockBackend?: MockBackend };

/** True only for local development with NEXT_PUBLIC_MOCK_MODE=true. Production builds never report mock mode (F19, D90). */
export function isMockMode(): boolean {
  return process.env.NEXT_PUBLIC_MOCK_MODE === "true" && process.env.NODE_ENV !== "production";
}

function browserStorage(): Storage | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

/** One backend per page load; it survives hot reloads. Throws outside localhost. */
export function getMockBackend(): MockBackend {
  if (typeof window !== "undefined" && !LOCAL_HOSTNAMES.includes(window.location.hostname)) {
    throw new Error("Mock mode is only allowed on localhost");
  }
  const globalState = globalThis as GlobalWithMock;
  globalState.__retroRoomMockBackend ??= createMockBackend({ storage: browserStorage() });
  return globalState.__retroRoomMockBackend;
}

export { MOCK_STATE_KEY };
