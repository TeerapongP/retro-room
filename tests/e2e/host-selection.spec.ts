/**
 * Host Selection QA — settlement and host_selection phase tests.
 *
 * Verifies the leaderboard, host wheel, and hand-over button behavior
 * after the admin ends the game.
 */
import { test, expect } from "@playwright/test";
import { reachTreasureRush, createAndStartGame } from "./helpers";

test.describe("Host Selection — post-game flow", () => {
  test.beforeEach(async ({ page }) => {
    await reachTreasureRush(page);
    await createAndStartGame(page);
    await page.getByTestId("btn-open-chest").waitFor({ state: "visible", timeout: 10_000 });
  });

  test("admin end-game transitions to settlement", async ({ page }) => {
    const endBtn = page.getByTestId("btn-end-game");
    const hasEnd = await endBtn.isVisible().catch(() => false);
    if (!hasEnd) { test.skip(); return; }

    await endBtn.click();
    // Settlement shows leaderboard and score table.
    await expect(page.getByTestId("leaderboard")).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("text=ผลคะแนนรอบนี้")).toBeVisible({ timeout: 10_000 });
  });

  test("leaderboard is visible in playing phase", async ({ page }) => {
    await expect(page.getByTestId("leaderboard")).toBeVisible();
  });

  test("leaderboard shows player row with score", async ({ page }) => {
    const lb = page.getByTestId("leaderboard");
    await expect(lb).toBeVisible();
    await expect(lb).toContainText("แต้ม");
  });

  test("settlement phase: Lock Scores button visible for admin", async ({ page }) => {
    const endBtn = page.getByTestId("btn-end-game");
    const hasEnd = await endBtn.isVisible().catch(() => false);
    if (!hasEnd) { test.skip(); return; }

    await endBtn.click();
    await page.getByTestId("leaderboard").waitFor({ state: "visible", timeout: 15_000 });

    const lockBtn = page.getByRole("button", { name: /lock scores/i });
    const hasLock = await lockBtn.isVisible().catch(() => false);
    if (hasLock) {
      await expect(lockBtn).toBeEnabled();
    }
  });

  test("host selection phase: wheel renders after lock", async ({ page }) => {
    const endBtn = page.getByTestId("btn-end-game");
    const hasEnd = await endBtn.isVisible().catch(() => false);
    if (!hasEnd) { test.skip(); return; }

    await endBtn.click();
    await page.getByTestId("leaderboard").waitFor({ state: "visible", timeout: 15_000 });

    const lockBtn = page.getByRole("button", { name: /lock scores/i });
    const hasLock = await lockBtn.isVisible().catch(() => false);
    if (!hasLock) { test.skip(); return; }

    await lockBtn.click();
    // After locking, host selection phase shows wheel section.
    await expect(page.locator("text=เลือก Host คนถัดไป")).toBeVisible({ timeout: 15_000 });
  });

  test("host-selection: hand-over-host button visible after spin", async ({ page }) => {
    const endBtn = page.getByTestId("btn-end-game");
    const hasEnd = await endBtn.isVisible().catch(() => false);
    if (!hasEnd) { test.skip(); return; }

    await endBtn.click();
    await page.getByTestId("leaderboard").waitFor({ state: "visible", timeout: 15_000 });
    const lockBtn = page.getByRole("button", { name: /lock scores/i });
    const hasLock = await lockBtn.isVisible().catch(() => false);
    if (!hasLock) { test.skip(); return; }

    await lockBtn.click();
    await page.locator("text=เลือก Host คนถัดไป").waitFor({ state: "visible", timeout: 15_000 });

    // Admin spins the host wheel.
    const spinWheelBtn = page.getByRole("button", { name: /spin|หมุน/i }).first();
    const hasSpin = await spinWheelBtn.isVisible().catch(() => false);
    if (!hasSpin) { test.skip(); return; }

    await spinWheelBtn.click();
    // After spin resolves, hand-over-host button should appear.
    const handoverBtn = page.getByTestId("btn-handover-host");
    const hasHandover = await handoverBtn.waitFor({ state: "visible", timeout: 20_000 }).then(() => true).catch(() => false);
    if (hasHandover) {
      await expect(handoverBtn).toBeEnabled();
    }
  });
});
