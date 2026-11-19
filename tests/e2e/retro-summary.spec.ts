import { expect, test } from "@playwright/test";
import { mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { BASE_URL, getCurrentBoardId, mockSignIn } from "./helpers";

test("Thai summary charts, exports, and responsive report", async ({ page }, testInfo) => {
  await mockSignIn(page);
  const boardId = getCurrentBoardId(page);
  await page.goto(`${BASE_URL}/boards/${boardId}`);
  await page.waitForFunction(() => Boolean((window as Window & { __retroRoomMockBackend?: object }).__retroRoomMockBackend));
  const cardIds = await page.evaluate(async (boardId) => {
    const backend = (window as unknown as Window & { __retroRoomMockBackend: {
      startSession: (id: string) => Promise<void>;
      joinBoard: (id: string, uid: string, name: string) => Promise<void>;
      addCard: (id: string, uid: string, category: "went-well" | "to-improve" | "ideas", text: string) => Promise<void>;
      setPhase: (id: string, phase: number) => Promise<void>;
    } }).__retroRoomMockBackend;
    await backend.startSession(boardId);
    await backend.joinBoard(boardId, "mock-ploy", "Ploy");
    await backend.setPhase(boardId, 1);
    for (const [category, text] of [
      ["went-well", "ส่งงานตามแผน"], ["went-well", "ช่วยกันแก้บั๊กเร็ว"],
      ["to-improve", "ลดเวลาประชุม"], ["to-improve", "เขียน test เพิ่ม"],
      ["ideas", "ลอง pair programming"], ["ideas", "แชร์ความรู้วันศุกร์"],
    ] as const) await backend.addCard(boardId, "mock-ploy", category, text);
    const state = JSON.parse(localStorage.getItem("retro-room:mock-state") ?? "{}") as { cards?: Record<string, Record<string, { id: string }>> };
    const ids = Object.values(state.cards?.[boardId] ?? {}).map((card) => card.id);
    if (ids.length !== 6) throw new Error("Expected six summary fixture cards");
    await backend.setPhase(boardId, 6);
    return ids;
  }, boardId);
  await expect(page.getByRole("heading", { name: "สรุปย้อนหลัง" })).toBeVisible();
  await expect(page.locator(".phase-step-current")).toContainText("สรุป");
  await expect(page.locator(".retro-summary-page")).toHaveCSS("max-width", "none");
  await expect(page.getByRole("heading", { name: "รายการที่ต้องทำ" })).toHaveCount(0);
  const actionIds = await page.evaluate(async ({ boardId, cardIds }: { boardId: string; cardIds: string[] }) => {
    const backend = (window as unknown as Window & { __retroRoomMockBackend: {
      setPhase: (id: string, phase: number) => Promise<void>;
      saveMyVotes: (id: string, uid: string, cards: string[]) => Promise<void>;
      createActionItem: (id: string, text: string, dueDate: string) => Promise<void>;
      setActionItemStatus: (id: string, itemId: string, status: "not-started" | "in-progress" | "completed") => Promise<void>;
    } }).__retroRoomMockBackend;
    await backend.setPhase(boardId, 3);
    await backend.saveMyVotes(boardId, "mock-admin", cardIds.slice(0, 3));
    await backend.saveMyVotes(boardId, "mock-ploy", cardIds.slice(0, 2));
    await backend.createActionItem(boardId, "ทำคู่มือฉบับย่อ", "2026-11-15");
    await backend.createActionItem(boardId, "เพิ่มชุดทดสอบ", "2026-11-16");
    const state = JSON.parse(localStorage.getItem("retro-room:mock-state") ?? "{}") as { actionItems?: Record<string, Record<string, { id: string }>> };
    const ids = Object.keys(state.actionItems?.[boardId] ?? {});
    if (ids.length !== 2) throw new Error("Expected two summary fixture actions");
    await backend.setActionItemStatus(boardId, ids[1], "completed");
    await backend.setPhase(boardId, 6);
    return ids;
  }, { boardId, cardIds });

  await page.evaluate(async ({ boardId, cardIds, actionIds }: { boardId: string; cardIds: string[]; actionIds: string[] }) => {
    const backend = (window as unknown as Window & { __retroRoomMockBackend: {
      completeSession: (id: string) => Promise<void>;
      addCard: (id: string, uid: string, category: "went-well" | "to-improve" | "ideas", text: string) => Promise<void>;
      deleteCard: (id: string, cardId: string) => Promise<void>;
      resetBoard: (id: string) => Promise<void>;
      startSession: (id: string) => Promise<void>;
      saveMyVotes: (id: string, uid: string, cards: string[]) => Promise<void>;
      setActionItemStatus: (id: string, itemId: string, status: "not-started" | "in-progress" | "completed") => Promise<void>;
      setPhase: (id: string, phase: number) => Promise<void>;
    } }).__retroRoomMockBackend;
    await backend.completeSession(boardId);
    await backend.resetBoard(boardId);
    await backend.startSession(boardId);
    for (const cardId of cardIds) await backend.deleteCard(boardId, cardId);
    await backend.setPhase(boardId, 1);
    for (const [category, text] of [
      ["went-well", "ส่งต่องานชัดเจน"], ["went-well", "รีวิวโค้ดสม่ำเสมอ"], ["went-well", "ส่งงานตรงเวลา"],
      ["to-improve", "จัดลำดับงานใหม่"], ["ideas", "ทำ demo ให้ลูกค้าดู"], ["ideas", "ทดลองเครื่องมือใหม่"],
    ] as const) await backend.addCard(boardId, "mock-ploy", category, text);
    const state = JSON.parse(localStorage.getItem("retro-room:mock-state") ?? "{}") as { cards?: Record<string, Record<string, { id: string }>> };
    const newCardIds = Object.values(state.cards?.[boardId] ?? {}).map((card) => card.id);
    if (newCardIds.length !== 6) throw new Error("Expected six cards for the second session");
    await backend.setPhase(boardId, 3);
    await backend.saveMyVotes(boardId, "mock-admin", newCardIds.slice(0, 3));
    await backend.saveMyVotes(boardId, "mock-ploy", newCardIds.slice(0, 2));
    await backend.setActionItemStatus(boardId, actionIds[0], "completed");
    await backend.setPhase(boardId, 6);
    await backend.completeSession(boardId);
  }, { boardId, cardIds, actionIds });

  await expect(page.locator("svg[aria-labelledby='categories-trend-title categories-trend-desc']")).toBeVisible();
  await expect(page.locator("svg[aria-labelledby='completion-trend-title completion-trend-desc']")).toBeVisible();
  if (testInfo.project.name === "mobile") {
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }

  const output = resolve("artifacts/playwright/screenshots");
  await mkdir(output, { recursive: true });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: resolve(output, `retro-summary-${testInfo.project.name}.png`), fullPage: true });

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "ส่งออกไฟล์ Excel" }).click();
  const download = await downloadPromise;
  const workbookPath = resolve(output, `retro-summary-${testInfo.project.name}.xls`);
  await download.saveAs(workbookPath);
  const workbook = await readFile(workbookPath, "utf8");
  expect(workbook).toContain("สามการ์ดไลก์สูงสุด");
  expect(workbook).toContain("ทำคู่มือฉบับย่อ");

  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".phase-stepper")).toBeHidden();
  await expect(page.locator(".board-account")).toBeHidden();
  await expect(page.locator(".retro-summary-page")).toBeVisible();
  await expect(page.locator("svg[role=img]")).toHaveCount(3);
  await page.pdf({ path: resolve(output, `retro-summary-${testInfo.project.name}.pdf`), printBackground: true, preferCSSPageSize: true });
});
