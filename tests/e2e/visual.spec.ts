import { test, expect } from "@playwright/test";
import { reachTreasureRush } from "./helpers";

const VIEWPORTS = [
  { name: "desktop-1920", width: 1920, height: 1080 },
  { name: "desktop-1366", width: 1366, height: 768 },
  { name: "tablet-768", width: 768, height: 1024 },
  { name: "mobile-390", width: 390, height: 844 },
];

for (const viewport of VIEWPORTS) {
  test(`${viewport.name}: ภาษาไทยและร้านเทศกาลไม่ล้นจอ`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "mobile", "ภาพหลักถ่ายครั้งเดียวต่อขนาดหน้าจอที่กำหนด");
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await reachTreasureRush(page);
    await expect(page.getByRole("heading", { name: "วงล้อมหาภัย" })).toBeVisible();
    await page.screenshot({ path: `artifacts/playwright/screenshots/${viewport.name}-festival-setup.png`, fullPage: true });

    await page.getByRole("button", { name: "เริ่มเกม" }).click();
    await page.getByRole("button", { name: "เปิดร้านค้า" }).click();
    await expect(page.locator(".chaos-item")).toHaveCount(35);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(overflow).toBe(false);
    await page.screenshot({ path: `artifacts/playwright/screenshots/${viewport.name}-festival-shop.png`, fullPage: true });
  });
}
