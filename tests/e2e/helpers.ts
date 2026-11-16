/**
 * Shared helpers for Treasure Rush E2E tests.
 * All tests run against the mock backend (NEXT_PUBLIC_MOCK_MODE=true).
 *
 * Limitation: each Playwright browser context owns its own window.__retroRoomMockBackend,
 * so "multiplayer" tests observe the same player from different context angles but cannot
 * share real Firestore state without the Firebase emulator.
 */
import { type Page } from "@playwright/test";

export const BASE_URL = "http://localhost:3000";
export const MOCK_BOARD_ID = "sprint23";

/** Sign in via the mock backend's instant sign-in. In mock mode, clicking
 *  "Login with Google" calls getMockBackend().signIn() without opening a popup.
 *  Handles the case where the user is already signed in (immediate redirect). */
export async function mockSignIn(page: Page): Promise<void> {
  await page.goto(BASE_URL + "/login");

  // If already signed in, the app redirects away from /login immediately.
  const alreadyIn = await page
    .waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 3_000 })
    .then(() => true)
    .catch(() => false);

  if (!alreadyIn) {
    const btn = page.getByRole("button", { name: /login with google/i });
    await btn.waitFor({ state: "visible", timeout: 15_000 });
    await btn.click();
    await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15_000 });
  }

  // Handle /setup (player name required for first-time mock users).
  if (page.url().includes("/setup")) {
    const nameInput = page.getByRole("textbox");
    if (await nameInput.isVisible().catch(() => false)) {
      await nameInput.fill("TestPlayer");
      const saveBtn = page.getByRole("button", { name: /save|บันทึก|confirm|ยืนยัน/i });
      if (await saveBtn.isVisible().catch(() => false)) {
        await saveBtn.click();
        await page.waitForURL((u) => !u.pathname.startsWith("/setup"), { timeout: 10_000 });
      }
    }
  }
}

/** Navigate to the sprint23 board. */
export async function goToBoard(page: Page): Promise<void> {
  await page.goto(`${BASE_URL}/boards/${MOCK_BOARD_ID}`);
}

/** Advance the mock board to phase 5 (TreasureRush) via JS injection.
 *  Requires the mock backend to be initialised (page has started subscribing to Firestore). */
export async function setPhase5(page: Page): Promise<void> {
  // Wait for the mock backend singleton to be attached by the React app.
  await page.waitForFunction(
    () => typeof (window as unknown as { __retroRoomMockBackend?: object }).__retroRoomMockBackend !== "undefined",
    { timeout: 15_000 },
  );
  await page.evaluate((boardId) => {
    const backend = (window as unknown as { __retroRoomMockBackend: { setPhase: (id: string, phase: number) => Promise<void> } }).__retroRoomMockBackend;
    return backend.setPhase(boardId, 5);
  }, MOCK_BOARD_ID);
  // Wait for TreasureRush section to mount.
  await waitForTreasureRush(page);
}

/** Wait for TreasureRush section to appear. */
export async function waitForTreasureRush(page: Page): Promise<void> {
  await page.locator('[aria-label="Treasure Rush"]').waitFor({ state: "visible", timeout: 20_000 });
}

/** Full flow: sign in, navigate to board, set phase 5. Returns when TreasureRush is visible. */
export async function reachTreasureRush(page: Page): Promise<void> {
  await mockSignIn(page);
  // After sign-in, navigate directly to the board (even if already there).
  const currentUrl = page.url();
  if (!currentUrl.includes(`/boards/${MOCK_BOARD_ID}`)) {
    await goToBoard(page);
  }
  await setPhase5(page);
}

/** Create a game and start a round (admin flow). Assumes already in phase 5. */
export async function createAndStartGame(page: Page): Promise<void> {
  const createBtn = page.getByTestId("btn-create-game");
  const spinBtn = page.getByTestId("btn-spin-start");
  const openBtn = page.getByTestId("btn-open-chest");

  // If already in playing phase, skip.
  if (await openBtn.isVisible().catch(() => false)) return;

  // Create game if needed.
  if (await createBtn.isVisible().catch(() => false)) {
    await createBtn.click();
    await spinBtn.waitFor({ state: "visible", timeout: 10_000 });
  }

  // Spin and start.
  if (await spinBtn.isVisible().catch(() => false)) {
    await spinBtn.click();
  }

  await openBtn.waitFor({ state: "visible", timeout: 15_000 });
}
