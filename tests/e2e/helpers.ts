/**
 * Shared helpers for Wheel of Chaos browser tests.
 * These flows exercise the local mock backend, not Firebase multiplayer.
 *
 * Limitation: each Playwright browser context owns its own window.__retroRoomMockBackend,
 * so "multiplayer" tests observe the same player from different context angles but cannot
 * share real Firestore state without the Firebase emulator.
 */
import { type Page } from "@playwright/test";

export function getCurrentBoardId(page: Page): string {
  const match = new URL(page.url()).pathname.match(/^\/boards\/([^/]+)$/);
  if (!match) throw new Error("Expected the launcher to open a board");
  return decodeURIComponent(match[1]);
}

/** Sign in via the mock backend's instant sign-in. In mock mode, clicking
 *  "Login with Google" calls getMockBackend().signIn() without opening a popup.
 *  Handles the case where the user is already signed in (immediate redirect). */
export async function mockSignIn(page: Page): Promise<void> {
  await page.goto("/login");

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
  await page.waitForURL((url) => /^\/boards\/[^/]+$/.test(url.pathname), { timeout: 15_000 });
}

export async function mockSwitchUser(page: Page, uid: string): Promise<void> {
  await page.evaluate((nextUid) => {
    const key = "retro-room:mock-state";
    const raw = localStorage.getItem(key);
    if (!raw) throw new Error("Mock state is unavailable");
    const state = JSON.parse(raw) as { session: string | null };
    state.session = nextUid;
    localStorage.setItem(key, JSON.stringify(state));
  }, uid);
  await page.reload();
  await waitForTreasureRush(page);
}

/** Prepare the launcher-created board for the shared Chaos E2E flow. */
async function seedChaosTestBoard(page: Page, boardId: string): Promise<void> {
  await page.waitForFunction(
    () => typeof (window as unknown as { __retroRoomMockBackend?: object }).__retroRoomMockBackend !== "undefined",
    { timeout: 15_000 },
  );
  await page.evaluate(async (id) => {
    const backend = (window as unknown as Window & { __retroRoomMockBackend: {
      joinBoard: (boardId: string, uid: string, name: string) => Promise<void>,
      startSession: (boardId: string) => Promise<void>,
      setPhase: (boardId: string, phase: number) => Promise<void>,
    } }).__retroRoomMockBackend;
    for (const [uid, name] of [["mock-ploy", "Ploy"], ["mock-nok", "Nok"], ["mock-kai", "Kai"], ["mock-may", "May"], ["mock-pim", "Pim"], ["mock-ton", "Ton"]] as const) {
      await backend.joinBoard(id, uid, name);
    }
    await backend.startSession(id);
    await backend.setPhase(id, 5);
  }, boardId);
}

/** Wait for the Thai-labeled game section to appear. */
export async function waitForTreasureRush(page: Page): Promise<void> {
  await page.locator('[aria-label="วงล้อมหาภัย"]').waitFor({ state: "visible", timeout: 20_000 });
}

/** Full flow: sign in, prepare the created board, and set phase 5. */
export async function reachTreasureRush(page: Page): Promise<void> {
  await mockSignIn(page);
  await seedChaosTestBoard(page, getCurrentBoardId(page));
  await waitForTreasureRush(page);
}

/** Create a game and open its shop. */
export async function createAndStartGame(page: Page, participantCount = 6): Promise<void> {
  await reachTreasureRush(page);
  const setup = page.getByRole("region", { name: "เลือกผู้เล่นเริ่มเกม" });
  const participantChoices = setup.getByRole("checkbox");
  const availablePlayers = await participantChoices.count();
  if (participantCount < 1 || participantCount > availablePlayers) throw new Error("participantCount must be between 1 and " + availablePlayers);
  for (let index = participantCount; index < availablePlayers; index++) await participantChoices.nth(index).uncheck();
  const createButton = setup.getByRole("button", { name: "เริ่มเกม" });
  if (await createButton.isVisible().catch(() => false)) await createButton.click();
  await selectMobileTab(page, "ผู้เล่น");
  await page.getByRole("heading", { name: /^ผู้เล่นทั้งหมด \(\d+\) คน$/ }).waitFor({ state: "visible", timeout: 15_000 });
  await selectMobileTab(page, "วงล้อ");
  const shopButton = page.getByRole("button", { name: "เปิดร้านค้า" });
  if (await shopButton.isVisible().catch(() => false)) await shopButton.click();
  await selectMobileTab(page, "ร้านค้า");
  await page.locator('[aria-label="ร้านค้าไอเทม"]').waitFor({ state: "visible", timeout: 15_000 });
}

export async function selectMobileTab(page: Page, label: "วงล้อ" | "ร้านค้า" | "ผู้เล่น" | "ประวัติ"): Promise<void> {
  const tab = page.getByRole("button", { name: label, exact: true });
  if (await tab.isVisible().catch(() => false)) await tab.click();
}
