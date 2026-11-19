import { test, expect } from "@playwright/test";
import { reachTreasureRush, selectMobileTab, mockSwitchUser, getCurrentBoardId, createAndStartGame } from "./helpers";

test("เครื่องรางนำโชคลดขนาดชื่อผู้ใช้บนวงล้อ", async ({ page }) => {
  await createAndStartGame(page, 3);
  await page.getByRole("button", { name: "เครื่องมือผู้เล่นสำหรับทดสอบ" }).click();
  await page.getByRole("combobox", { name: "จำลองเล่นในชื่อ" }).selectOption("mock-ploy");
  const playerPanel = page.getByRole("complementary", { name: "กระเป๋าไอเทมและยอดเอริส" });
  const charm = page.locator(".chaos-item").filter({ hasText: "เครื่องรางนำโชค" });
  await charm.getByRole("button", { name: "ซื้อไอเทม · 15 เอริส" }).click();

  await selectMobileTab(page, "วงล้อ");
  await page.getByRole("button", { name: "ปิดร้านค้า" }).click();
  const wheelLabel = (name: string) => page.locator(".rr-roulette__svg text").filter({ hasText: name });
  await expect(wheelLabel("Ploy")).toHaveCSS("font-size", "15px");
  await expect(wheelLabel("Nok")).toHaveCSS("font-size", "15px");

  await selectMobileTab(page, "ร้านค้า");
  const inventoryCard = playerPanel.locator(".chaos-inventory article").filter({ hasText: "เครื่องรางนำโชค" });
  await inventoryCard.getByRole("button", { name: "ใช้ไอเทม", exact: true }).click();
  await expect(inventoryCard.getByRole("button", { name: "ใช้ไอเทมแล้ว" })).toBeDisabled();
  await selectMobileTab(page, "วงล้อ");
  await expect(wheelLabel("Ploy")).toHaveCSS("font-size", "12px");
  await expect(wheelLabel("Nok")).toHaveCSS("font-size", "15px");
});

test("ผู้เล่นเลือกชื่อเป้าหมายของจอมโจรเอริสก่อนยืนยัน", async ({ page }) => {
  await createAndStartGame(page, 3);
  await page.getByRole("button", { name: "เครื่องมือผู้เล่นสำหรับทดสอบ" }).click();
  const mockPlayer = page.getByRole("combobox", { name: "จำลองเล่นในชื่อ" });
  await mockPlayer.selectOption("mock-ploy");
  const playerPanel = page.getByRole("complementary", { name: "กระเป๋าไอเทมและยอดเอริส" });
  const shopCard = page.locator(".chaos-item").filter({ hasText: "จอมโจรเอริส" });
  await shopCard.getByRole("button", { name: "ซื้อไอเทม · 20 เอริส" }).click();
  const inventoryCard = playerPanel.getByRole("article").filter({ hasText: "จอมโจรเอริส" });
  await inventoryCard.getByRole("button", { name: "ใช้ไอเทม", exact: true }).click();
  const target = inventoryCard.getByRole("combobox", { name: "ผู้เล่นเป้าหมาย" });
  const confirm = inventoryCard.getByRole("button", { name: "ยืนยันใช้ไอเทม" });
  await expect(confirm).toBeDisabled();
  await expect(target.getByRole("option", { name: "Ploy", exact: true })).toHaveCount(0);
  await target.selectOption({ label: "Kai" });
  await confirm.click();
  await expect(playerPanel).toContainText("90 เอริส");
  await expect(inventoryCard.getByRole("button", { name: "ใช้ไอเทมแล้ว" })).toBeDisabled();
  await mockPlayer.selectOption("mock-nok");
  await expect(playerPanel).toContainText("100 เอริส");
  await mockPlayer.selectOption("mock-kai");
  await expect(playerPanel).toContainText("90 เอริส");
  await selectMobileTab(page, "ประวัติ");
  await expect(page.getByRole("complementary", { name: "ประวัติเกม" })).toContainText("Ploy ใช้จอมโจรเอริส ใส่ Kai");
});

test("ตลาดแลกเปลี่ยนเลือกชื่อและไอเทมของทั้งสองฝ่ายได้", async ({ page }) => {
  await createAndStartGame(page, 3);
  await page.getByRole("button", { name: "เครื่องมือผู้เล่นสำหรับทดสอบ" }).click();
  const mockPlayer = page.getByRole("combobox", { name: "จำลองเล่นในชื่อ" });
  const playerPanel = page.getByRole("complementary", { name: "กระเป๋าไอเทมและยอดเอริส" });
  const buy = async (name: string, price: number) => {
    const card = page.locator(".chaos-item").filter({ hasText: name });
    await card.getByRole("button", { name: `ซื้อไอเทม · ${price} เอริส` }).click();
  };

  await mockPlayer.selectOption("mock-ploy");
  await buy("ตลาดแลกเปลี่ยน", 20);
  await buy("โล่ศักดิ์สิทธิ์", 20);
  await mockPlayer.selectOption("mock-kai");
  await buy("ชำระมหาภัย", 15);
  await mockPlayer.selectOption("mock-ploy");

  const auction = playerPanel.getByRole("article").filter({ hasText: "ตลาดแลกเปลี่ยน" });
  await auction.getByRole("button", { name: "ใช้ไอเทม", exact: true }).click();
  const target = auction.getByRole("combobox", { name: "ผู้เล่นเป้าหมาย" });
  const targetItem = auction.getByRole("combobox", { name: "ไอเทมของเป้าหมาย" });
  const offeredItem = auction.getByRole("combobox", { name: "ไอเทมของคุณสำหรับแลก" });
  const confirm = auction.getByRole("button", { name: "ยืนยันใช้ไอเทม" });
  await target.selectOption({ label: "Kai" });
  await targetItem.selectOption({ label: "ชำระมหาภัย" });
  await offeredItem.selectOption({ label: "โล่ศักดิ์สิทธิ์" });
  await confirm.click();

  await mockPlayer.selectOption("mock-kai");
  await selectMobileTab(page, "วงล้อ");
  await expect(page.getByRole("region", { name: "ข้อเสนอรอคำตอบ" })).toContainText("Ploy ส่งข้อเสนอถึงคุณ");
  await page.getByRole("button", { name: "ยอมรับ" }).click();
  await selectMobileTab(page, "ร้านค้า");
  await expect(playerPanel.locator(".chaos-inventory")).toContainText("โล่ศักดิ์สิทธิ์");
  await expect(playerPanel.locator(".chaos-inventory")).not.toContainText("ชำระมหาภัย");
  await mockPlayer.selectOption("mock-ploy");
  await expect(playerPanel.locator(".chaos-inventory")).toContainText("ชำระมหาภัย");
  await expect(playerPanel.locator(".chaos-inventory")).not.toContainText("โล่ศักดิ์สิทธิ์");
});

test("ผู้เล่นใช้พรสมบัติระหว่างเปิดร้านค้า", async ({ page }) => {
  await createAndStartGame(page, 1);
  await page.getByRole("button", { name: "เครื่องมือผู้เล่นสำหรับทดสอบ" }).click();
  await page.getByRole("combobox", { name: "จำลองเล่นในชื่อ" }).selectOption("mock-ploy");
  const playerPanel = page.locator('[aria-label="กระเป๋าไอเทมและยอดเอริส"]');
  await expect(playerPanel).toContainText("100 เอริส");

  const shopCard = page.locator(".chaos-item").filter({ hasText: "พรสมบัติ" });
  await shopCard.getByRole("button", { name: "ซื้อไอเทม · 15 เอริส" }).click();
  await expect(playerPanel).toContainText("85 เอริส");

  const inventoryCard = page.locator(".chaos-inventory article").filter({ hasText: "พรสมบัติ" });
  await inventoryCard.getByRole("button", { name: "ใช้ไอเทม" }).click();
  await expect(playerPanel).toContainText("100 เอริส");
  await expect(inventoryCard.getByRole("button", { name: "ใช้ไอเทมแล้ว" })).toBeDisabled();
});

test("ผู้เล่นใช้โอกาสแก้มือในช่วงตอบโต้ก่อนหมดเวลา", async ({ page }) => {
  await createAndStartGame(page, 1);
  await page.getByRole("button", { name: "เครื่องมือผู้เล่นสำหรับทดสอบ" }).click();
  await page.getByRole("combobox", { name: "จำลองเล่นในชื่อ" }).selectOption("mock-ploy");
  const playerPanel = page.locator('[aria-label="กระเป๋าไอเทมและยอดเอริส"]');
  const shopCard = page.locator(".chaos-item").filter({ hasText: "โอกาสแก้มือ" });
  await shopCard.getByRole("button", { name: "ซื้อไอเทม · 20 เอริส" }).click();

  await selectMobileTab(page, "วงล้อ");
  await page.getByRole("button", { name: "ปิดร้านค้า" }).click();
  await page.getByRole("button", { name: "หมุนวงล้อ", exact: true }).click();
  await expect(page.locator(".chaos-wheel-result")).toHaveText("Ploy");
  await page.getByRole("button", { name: /หมุนวงล้อเหตุการณ์|หมุนเหตุการณ์เพิ่มเติม/ }).click();
  await expect(page.locator(".chaos-turn")).toContainText("ช่วงตอบโต้");

  await selectMobileTab(page, "ร้านค้า");
  const inventoryCard = playerPanel.locator(".chaos-inventory article").filter({ hasText: "โอกาสแก้มือ" });
  const useButton = inventoryCard.getByRole("button", { name: "ใช้ไอเทม" });
  await expect(useButton).toBeEnabled();
  await useButton.click();
  await expect(inventoryCard.getByRole("button", { name: "ใช้ไอเทมแล้ว" })).toBeDisabled();
});

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
