import { test, expect } from "@playwright/test";
import { createAndStartGame, selectMobileTab } from "./helpers";

test("ผู้ดูแลตัดสิทธิ์โฮสต์เดิมและยืนยันผู้รับหน้าที่คนถัดไป", async ({ page }) => {
  await createAndStartGame(page, 3);
  await selectMobileTab(page, "วงล้อ");
  await page.getByRole("button", { name: "ปิดร้านค้า" }).click();

  for (let turn = 0; turn < 5; turn++) {
    await page.getByRole("button", { name: "หมุนวงล้อ", exact: true }).click();
    for (let eventNumber = 0; eventNumber < 2; eventNumber++) {
      const spin = page.getByRole("button", { name: /หมุนวงล้อเหตุการณ์|หมุนเหตุการณ์เพิ่มเติม/ });
      await spin.waitFor({ state: "visible" });
      await spin.click();
      await page.getByRole("button", { name: "สรุปผลเหตุการณ์" }).click();
      if (await page.getByRole("button", { name: "ไปยังรอบถัดไป" }).isVisible().catch(() => false)) break;
    }
    await page.getByRole("button", { name: "ไปยังรอบถัดไป" }).click();
  }

  const candidates = page.locator(".chaos-final-list");
  await selectMobileTab(page, "ผู้เล่น");
  const roster = page.locator(".chaos-roster");
  const currentHost = (await roster.getByText(/· โฮสต์$/).first().textContent())?.replace(" · โฮสต์", "");
  if (currentHost) await expect(candidates).not.toContainText(currentHost);

  const eligibility = page.locator('[aria-label="ตั้งค่าผู้มีสิทธิ์เป็นโฮสต์"]');
  const firstCandidate = await eligibility.locator("label").first().textContent();
  await eligibility.locator('input[type="checkbox"]').first().uncheck();
  await eligibility.getByRole("button", { name: "บันทึกสิทธิ์โฮสต์" }).click();
  if (firstCandidate?.trim()) await expect(candidates).not.toContainText(firstCandidate.trim());

  await selectMobileTab(page, "วงล้อ");
  await page.getByRole("button", { name: "หมุนวงล้อ", exact: true }).click();
  await selectMobileTab(page, "ผู้เล่น");
  await expect(page.locator(".chaos-dialogue")).toContainText("โฮสต์คนถัดไป:");
  await selectMobileTab(page, "วงล้อ");
  await page.getByRole("button", { name: "ยืนยันโฮสต์คนถัดไป" }).click();
  await expect(page.locator(".chaos-phase")).toHaveText("จบเกมแล้ว");
});
