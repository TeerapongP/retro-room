import { test, expect } from "@playwright/test";
import { createAndStartGame, mockSwitchUser, selectMobileTab } from "./helpers";

test.describe("ร้านค้าไอเทมมหาภัย", () => {
  test.beforeEach(async ({ page }) => {
    await createAndStartGame(page, 3);
    await mockSwitchUser(page, "mock-ploy");
    await selectMobileTab(page, "ร้านค้า");
  });

  test("แสดงไอเทม 35 ชนิด ราคา และสถานะของคงเหลือ", async ({ page }) => {
    const shop = page.getByRole("region", { name: "ร้านค้าไอเทม" });
    await expect(shop).toBeVisible();
    await expect(shop.locator(".chaos-item")).toHaveCount(35);
    await expect(shop).toContainText("ราคา 20 เอริส");
    await expect(shop).toContainText("มี 1 ชิ้น");
  });

  test("กรองไอเทมด้วยชื่อภาษาไทยและหมวดหมู่", async ({ page }) => {
    const shop = page.getByRole("region", { name: "ร้านค้าไอเทม" });
    await page.getByRole("textbox", { name: "ค้นหาไอเทม" }).fill("คุกกี้ทำนาย");
    await expect(shop.locator(".chaos-item")).toHaveCount(1);
    await page.getByRole("textbox", { name: "ค้นหาไอเทม" }).clear();
    await page.getByLabel("เลือกหมวดหมู่").selectOption("defense");
    await expect(shop.locator(".chaos-item")).toHaveCount(7);
  });

  test("ซื้อไอเทมแล้วอัปเดตยอดเอริส ช่องกระเป๋า และสถานะขายหมด", async ({ page }) => {
    const item = page.locator(".chaos-item").filter({ hasText: "คุกกี้ทำนาย" });
    await item.getByRole("button", { name: "ซื้อไอเทม · 10 เอริส" }).click();
    await expect(page.getByText("90 เอริส").first()).toBeVisible();
    await expect(page.getByText("1 / 5 ชิ้น")).toBeVisible();
    await expect(item).toContainText("ขายหมดแล้ว");
  });

  test("แอดมินเห็นชื่อผู้ใช้ไอเทมและผู้เล่นที่ถูกเล็ง", async ({ page }) => {
    const item = page.locator(".chaos-item").filter({ hasText: "จอมโจรเอริส" });
    await item.getByRole("button", { name: "ซื้อไอเทม · 20 เอริส" }).click();
    await page.getByLabel("ผู้เล่นเป้าหมาย").selectOption("mock-nok");
    await page.locator(".chaos-inventory").getByRole("button", { name: "ใช้ไอเทม" }).click();
    await expect(page.locator(".chaos-history")).toContainText("Ploy ใช้จอมโจรเอริส ใส่ Nok");

    await mockSwitchUser(page, "mock-admin");
    await selectMobileTab(page, "ประวัติ");
    await expect(page.locator(".chaos-history")).toContainText("Ploy ใช้จอมโจรเอริส ใส่ Nok");
  });
});
