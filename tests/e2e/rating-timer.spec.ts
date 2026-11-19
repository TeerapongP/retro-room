import { expect, test } from "@playwright/test";
import { getCurrentBoardId, mockSignIn } from "./helpers";

test("ให้คะแนนแบบจับเวลาและเปิดผลคะแนนโดยแอดมิน", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-11-18T03:00:00.000Z") });
  await mockSignIn(page);
  const boardId = getCurrentBoardId(page);
  await page.waitForFunction(() => Boolean((window as Window & { __retroRoomMockBackend?: object }).__retroRoomMockBackend));
  await page.evaluate(async (boardId) => {
    const backend = (window as unknown as Window & { __retroRoomMockBackend: {
      joinBoard: (id: string, uid: string, name: string) => Promise<void>;
      startSession: (id: string) => Promise<void>;
      setPhase: (id: string, phase: number) => Promise<void>;
      saveMyRating: (id: string, uid: string, score: number) => Promise<void>;
    } }).__retroRoomMockBackend;
    await backend.joinBoard(boardId, "mock-ploy", "Ploy");
    await backend.joinBoard(boardId, "mock-nok", "Nok");
    await backend.joinBoard(boardId, "mock-kai", "Kai");
    await backend.startSession(boardId);
    await backend.setPhase(boardId, 4);
    await backend.saveMyRating(boardId, "mock-ploy", 4);
    await backend.saveMyRating(boardId, "mock-nok", 3);
    await backend.saveMyRating(boardId, "mock-kai", 5);
  }, boardId);

  await expect(page.locator(".rating-hidden-results")).toBeVisible();
  await expect(page.locator(".rating-hidden-results .rating-average")).toHaveText("ผลคะแนน");
  await expect(page.getByRole("button", { name: "เปิดคะแนน" })).toHaveCount(0);
  await page.locator(".rating-choice").nth(6).click();
  await expect(page.locator(".rating-choice").nth(6)).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: "⏱ ตั้งเวลา" }).click();
  await page.locator("#timer-custom-minutes").fill("1");
  await page.getByRole("button", { name: "เริ่ม" }).click();
  await expect(page.getByRole("timer")).toContainText("01:00");
  await expect(page.getByRole("button", { name: "เปิดคะแนน" })).toHaveCount(0);

  await page.clock.fastForward(60_000);
  await expect(page.getByRole("button", { name: "เปิดคะแนน" })).toBeVisible();
  await expect(page.getByText("หมดเวลาแล้ว รอแอดมินกดเปิดคะแนน")).toBeVisible();

  async function switchMockUser(uid: string) {
    await page.evaluate((nextUid) => {
      const raw = localStorage.getItem("retro-room:mock-state");
      if (!raw) throw new Error("Mock state is unavailable");
      const state = JSON.parse(raw) as { session: string | null };
      state.session = nextUid;
      localStorage.setItem("retro-room:mock-state", JSON.stringify(state));
    }, uid);
    await page.reload();
    await page.waitForFunction(() => Boolean((window as Window & { __retroRoomMockBackend?: object }).__retroRoomMockBackend));
  }

  await switchMockUser("mock-ploy");
  await expect(page.getByRole("button", { name: "เปิดคะแนน" })).toHaveCount(0);
  const memberRevealDenied = await page.evaluate(async (boardId) => {
    const backend = (window as unknown as Window & { __retroRoomMockBackend: { revealRatings: (id: string) => Promise<void> } }).__retroRoomMockBackend;
    try {
      await backend.revealRatings(boardId);
      return false;
    } catch {
      return true;
    }
  }, boardId);
  expect(memberRevealDenied).toBe(true);

  await switchMockUser("mock-admin");
  await page.getByRole("button", { name: "เปิดคะแนน" }).click();
  await expect(page.locator(".rating-average")).toHaveText("ค่าเฉลี่ย 4 จาก 4 คน");
  await expect(page.locator(".rating-hidden-results")).toHaveCount(0);
  for (const name of ["Aomsin", "Ploy", "Nok", "Kai"]) await expect(page.locator(".rating-people")).toContainText(name);
});
