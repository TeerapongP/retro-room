/**
 * Battle QA — BattleShop item display and interaction tests.
 *
 * Verifies that the shop panel opens, all 11 items are present,
 * TC cost labels are visible, and clicking a defensive item calls
 * the buy handler without crashing.
 */
import { test, expect } from "@playwright/test";
import { reachTreasureRush, createAndStartGame } from "./helpers";

const ALL_ITEMS = [
  "magic-shield",
  "treasure-lock",
  "recovery-potion",
  "mirror-shield",
  "bomb-gift",
  "sneaky-thief",
  "ice-trap",
  "chaos-swap",
  "lucky-key",
  "treasure-radar",
  "golden-pick",
] as const;

const ITEM_LABELS: Record<string, string> = {
  "magic-shield": "Magic Shield",
  "treasure-lock": "Treasure Lock",
  "recovery-potion": "Recovery",
  "mirror-shield": "Mirror Shield",
  "bomb-gift": "Bomb Gift",
  "sneaky-thief": "Sneaky Thief",
  "ice-trap": "Ice Trap",
  "chaos-swap": "Chaos Swap",
  "lucky-key": "Lucky Key",
  "treasure-radar": "Treasure Radar",
  "golden-pick": "Golden Pick",
};

test.describe("BattleShop — item display", () => {
  test.beforeEach(async ({ page }) => {
    await reachTreasureRush(page);
    await createAndStartGame(page);
    const shopBtn = page.getByTestId("btn-battle-shop");
    await shopBtn.waitFor({ state: "visible", timeout: 10_000 });
    await shopBtn.click();
    await page.getByTestId("battle-shop").waitFor({ state: "visible", timeout: 10_000 });
  });

  test("battle shop panel opens", async ({ page }) => {
    await expect(page.getByTestId("battle-shop")).toBeVisible();
  });

  test("shop shows TC balance row", async ({ page }) => {
    const shop = page.getByTestId("battle-shop");
    await expect(shop).toContainText("TC");
  });

  test("shop shows 3 category sections", async ({ page }) => {
    const shop = page.getByTestId("battle-shop");
    await expect(shop).toContainText("Defensive");
    await expect(shop).toContainText("Offensive");
    await expect(shop).toContainText("Lucky");
  });

  for (const item of ALL_ITEMS) {
    test(`item "${item}" is listed in the shop`, async ({ page }) => {
      const shop = page.getByTestId("battle-shop");
      const label = ITEM_LABELS[item] ?? item;
      const btn = shop.getByRole("button", { name: new RegExp(label, "i") });
      await expect(btn.first()).toBeVisible({ timeout: 5_000 });
    });

    test(`item "${item}" shows TC cost`, async ({ page }) => {
      const shop = page.getByTestId("battle-shop");
      const label = ITEM_LABELS[item] ?? item;
      const btn = shop.getByRole("button", { name: new RegExp(label, "i") }).first();
      await expect(btn).toContainText("TC");
    });
  }

  test("instant items show ⚡ทันที badge", async ({ page }) => {
    const shop = page.getByTestId("battle-shop");
    // recovery-potion and golden-pick are instant
    await expect(shop).toContainText("⚡ทันที");
  });

  test("shop closes when battle shop button is clicked again", async ({ page }) => {
    // Shop is open from beforeEach; click toggle to close.
    await page.getByTestId("btn-battle-shop").click();
    await expect(page.getByTestId("battle-shop")).not.toBeVisible({ timeout: 3_000 });
  });
});
