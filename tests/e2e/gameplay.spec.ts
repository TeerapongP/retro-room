import { test, expect } from "@playwright/test";
import { mockSignIn, reachTreasureRush, selectMobileTab, BASE_URL, getCurrentBoardId } from "./helpers";

test("เข้าสู่ระบบแล้วเปิดบอร์ดได้", async ({ page }) => {
  await mockSignIn(page);
  expect(page.url()).not.toContain("/login");
  await page.goto(BASE_URL + "/boards/" + getCurrentBoardId(page));
  await expect(page.getByRole("main")).toBeVisible();
});

test("หน้าเกมเลือกผู้เล่นน้อยกว่าเจ็ดคนได้", async ({ page }) => {
  await reachTreasureRush(page);
  await selectMobileTab(page, "ผู้เล่น");
  await expect(page.getByRole("heading", { name: "วงล้อมหาภัย" })).toBeVisible();
  const setup = page.getByRole("region", { name: "เลือกผู้เล่นเริ่มเกม" });
  await expect(setup.getByText("เลือกแล้ว 6 คน · จากทั้งหมด 6 คน")).toBeVisible();
  await setup.getByRole("checkbox").nth(5).uncheck();
  await expect(setup.getByText("เลือกแล้ว 5 คน · จากทั้งหมด 6 คน")).toBeVisible();
  await expect(page.getByText("โฮสต์ปัจจุบัน:")).toBeVisible();
});

test("หน้าเกมไม่มีคำสั่งซื้อของเดิม", async ({ page }) => {
  await reachTreasureRush(page);
  await expect(page.getByText(/Treasure Rush|Battle Shop|Final Rush|Treasure Coin/)).toHaveCount(0);
});