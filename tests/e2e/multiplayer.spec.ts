import { test, expect } from "@playwright/test";
import { createAndStartGame, mockSwitchUser, reachTreasureRush } from "./helpers";

test("ผู้ดูแลเลือกผู้เล่นน้อยกว่าสมาชิกทั้งหมดได้", async ({ page }) => {
  await reachTreasureRush(page);
  const setup = page.getByRole("region", { name: "เลือกผู้เล่นเริ่มเกม" });
  const choices = setup.getByRole("checkbox");
  await expect(choices).toHaveCount(6);
  await expect(setup.getByText("เลือกแล้ว 6 คน · จากทั้งหมด 6 คน")).toBeVisible();
  await choices.nth(5).uncheck();
  await expect(setup.getByText("เลือกแล้ว 5 คน · จากทั้งหมด 6 คน")).toBeVisible();
  await expect(setup.getByRole("button", { name: "เริ่มเกม" })).toBeEnabled();
});

test("ผู้เล่นที่เลือกทุกคนเริ่มด้วย 100 เอริสเมื่อเปิดร้านค้า", async ({ page }) => {
  await createAndStartGame(page, 3);
  await expect(page.locator(".chaos-roster li")).toHaveCount(3);

  for (const uid of ["mock-ploy", "mock-nok", "mock-kai"]) {
    await mockSwitchUser(page, uid);
    await expect(page.locator(".chaos-stat").filter({ hasText: "เอริสคงเหลือ" })).toContainText("100 เอริส");
  }
});