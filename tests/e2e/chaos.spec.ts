import { test, expect } from "@playwright/test";
import { reachTreasureRush, selectMobileTab, mockSwitchUser, getCurrentBoardId } from "./helpers";

test("แอดมินเลือกและเอาชื่อออกจากวงล้อได้ก่อนหมุนรอบแรก", async ({ page }) => {
  await reachTreasureRush(page);
  await page.getByRole("region", { name: "เลือกผู้เล่นเริ่มเกม" }).getByRole("button", { name: "เริ่มเกม" }).click();
  const settings = page.locator('[aria-label="ตั้งค่าวงล้อผู้เล่น"]');

  await page.getByRole("button", { name: "เปิดร้านค้า" }).click();
  await expect(settings).toHaveCount(0);
  await page.getByRole("button", { name: "ปิดร้านค้า" }).click();
  await expect(settings).toBeVisible();
  await expect(settings.getByLabel("Ploy")).toBeChecked();
  await settings.getByLabel("Ploy").uncheck();
  await expect(page.locator('[aria-label="รายชื่อผู้มีสิทธิ์"]')).not.toContainText("Ploy");
  await expect(page.locator('[aria-label="รายชื่อผู้มีสิทธิ์"] span')).toHaveCount(5);
  await page.getByRole("button", { name: "หมุนวงล้อ", exact: true }).click();
  await expect(page.locator(".chaos-wheel-result")).toHaveText(/^(Nok|Kai|May|Pim|Ton)$/);
});

test("หกผู้เล่นเล่นครบห้ารอบและยืนยันโฮสต์คนถัดไป", async ({ page }, testInfo) => {
  await reachTreasureRush(page);
  const boardId = getCurrentBoardId(page);
  await selectMobileTab(page, "ผู้เล่น");
  await expect(page.getByRole("heading", { name: "วงล้อมหาภัย" })).toBeVisible();
  await expect(page.getByText("เลือกแล้ว 6 คน · จากทั้งหมด 6 คน")).toBeVisible();
  await expect(page.locator(".chaos-config-list label")).toHaveCount(6);
  await expect(page.locator(".chaos-config-list")).not.toContainText("Aomsin");
  await page.getByRole("button", { name: "เริ่มเกม" }).click();
  await selectMobileTab(page, "ผู้เล่น");
  await expect(page.getByRole("heading", { name: "ผู้เล่นทั้งหมด (6) คน" })).toBeVisible();
  await expect(page.locator(".chaos-roster li")).toHaveCount(6);
  await expect(page.locator(".chaos-roster")).not.toContainText("Aomsin");
  await page.screenshot({ path: testInfo.outputPath("chaos-setup.png"), fullPage: true });

  await selectMobileTab(page, "วงล้อ");
  await page.getByRole("button", { name: "เปิดร้านค้า" }).click();
  await selectMobileTab(page, "ร้านค้า");
  await expect(page.getByText("แอดมินดูแลวงล้อและไม่ได้เป็นผู้เล่น")).toBeVisible();
  await expect(page.getByRole("combobox", { name: "จำลองเล่นในชื่อ" })).toHaveCount(0);
  await expect(page.locator('[aria-label="ตั้งค่าเป้าหมายไอเทม"]')).toHaveCount(0);
  await expect(page.locator('[aria-label="กระเป๋าไอเทมและยอดเอริส"]')).not.toContainText("100 เอริส");
  await mockSwitchUser(page, "mock-ploy");
  await selectMobileTab(page, "ร้านค้า");
  await expect(page.getByText("100 เอริส").first()).toBeVisible();
  await expect(page.locator(".chaos-item")).toHaveCount(35);
  await page.screenshot({ path: testInfo.outputPath("chaos-shop.png"), fullPage: true });

  for (const [name, price] of [["คุกกี้ทำนาย", 10], ["เจ็ดนำโชค", 10], ["เข็มทิศมหาภัย", 10], ["แอบดูโอกาส", 10], ["ชำระมหาภัย", 15]] as const) {
    const card = page.locator(".chaos-item").filter({ hasText: name });
    await card.getByRole("button", { name: `ซื้อไอเทม · ${price} เอริส` }).click();
  }
  await expect(page.getByText("5 / 5 ชิ้น")).toBeVisible();
  await expect(page.locator(".chaos-item").filter({ hasText: "พรสมบัติ" }).getByRole("button")).toBeDisabled();
  await mockSwitchUser(page, "mock-admin");
  await selectMobileTab(page, "วงล้อ");
  await page.getByRole("button", { name: "ปิดร้านค้า" }).click();

  for (let turn = 0; turn < 5; turn++) {
    await page.getByRole("button", { name: "หมุนวงล้อ", exact: true }).click();
    for (let eventNumber = 0; eventNumber < 2; eventNumber++) {
      const spinEvent = page.getByRole("button", { name: /หมุนวงล้อเหตุการณ์|หมุนเหตุการณ์เพิ่มเติม/ });
      await spinEvent.waitFor({ state: "visible" });
      await spinEvent.click();
      await page.getByRole("button", { name: "สรุปผลเหตุการณ์" }).click();
      if (await page.getByRole("button", { name: "ไปยังรอบถัดไป" }).isVisible().catch(() => false)) break;
    }
    if (turn === 0) {
      await page.locator('[aria-label="ตั้งค่าวงล้อผู้เล่น"]').getByLabel("Ploy").uncheck();
      await expect(page.locator('[aria-label="รายชื่อผู้มีสิทธิ์"]')).not.toContainText("Ploy");
      await expect(page.getByRole("button", { name: "ไปยังรอบถัดไป" })).toBeEnabled();
    }
    await page.getByRole("button", { name: "ไปยังรอบถัดไป" }).click();
  }

  await expect(page.locator(".chaos-phase")).toHaveText("เลือกโฮสต์คนถัดไป");
  await page.screenshot({ path: testInfo.outputPath("chaos-final-host.png"), fullPage: true });
  await expect(page.locator(".chaos-final-list")).not.toContainText("Aomsin");
  await selectMobileTab(page, "วงล้อ");
  await page.getByRole("button", { name: "หมุนวงล้อ", exact: true }).click();
  await selectMobileTab(page, "ผู้เล่น");
  await expect(page.locator(".chaos-dialogue")).toContainText("โฮสต์คนถัดไป:");

  const originalHistory = await page.evaluate((boardId) => {
    const backend = (window as unknown as { __retroRoomMockBackend: { getChaosBoard: (id: string) => { pastHostUids: string[] } } }).__retroRoomMockBackend;
    return backend.getChaosBoard(boardId).pastHostUids;
  }, boardId);
  await selectMobileTab(page, "วงล้อ");
  await page.getByRole("button", { name: "ยืนยันโฮสต์คนถัดไป" }).click();
  await expect(page.locator(".chaos-phase")).toHaveText("จบเกมแล้ว");
  const hostState = await page.evaluate((boardId) => {
    const backend = (window as unknown as { __retroRoomMockBackend: { getChaosBoard: (id: string) => { ownerId: string; hostUid: string | null; nextHostUid: string | null; pastHostUids: string[] } } }).__retroRoomMockBackend;
    return backend.getChaosBoard(boardId);
  }, boardId);
  expect(hostState.nextHostUid).not.toBeNull();
  expect(hostState.hostUid ?? hostState.ownerId).not.toBe(hostState.nextHostUid);
  expect(hostState.pastHostUids).toEqual(originalHistory);
  await page.getByRole("button", { name: "ส่งต่อหน้าที่โฮสต์" }).click();
  await expect.poll(async () => page.evaluate((boardId) => {
    const backend = (window as unknown as { __retroRoomMockBackend: { getChaosBoard: (id: string) => { hostUid: string } } }).__retroRoomMockBackend;
    return backend.getChaosBoard(boardId).hostUid;
  }, boardId)).toBe(hostState.nextHostUid);
  const finalHostState = await page.evaluate((boardId) => {
    const backend = (window as unknown as { __retroRoomMockBackend: { getChaosBoard: (id: string) => { hostUid: string; pastHostUids: string[] } } }).__retroRoomMockBackend;
    return backend.getChaosBoard(boardId);
  }, boardId);
  expect(finalHostState.pastHostUids).toEqual([...originalHistory, hostState.hostUid ?? hostState.ownerId]);
  await page.getByRole("button", { name: "ไปหน้าสรุปผล" }).click();
});
