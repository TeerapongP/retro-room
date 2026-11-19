import { expect, test, type Page } from "@playwright/test";
import firebaseE2E from "../../.firebase.e2e.json";
import { getCurrentBoardId } from "./helpers";

const ADMIN_EMAIL = "thirapong.pin@ascendcorp.com";
const PLAYER_EMAIL = "e2e-next-host-player@example.test";

async function signInWithAuthEmulator(page: Page, email: string, playerName: string): Promise<void> {
  await page.goto("/login");
  const popupPromise = page.waitForEvent("popup");
  await page.getByRole("button", { name: /login with google/i }).click();
  const popup = await popupPromise;
  await popup.waitForLoadState("load");
  const existingAccount = popup.getByText(email, { exact: true });

  if (await existingAccount.isVisible().catch(() => false)) {
    await existingAccount.click();
  } else {
    await popup.locator("#add-account-button").click();
    await popup.locator("#email-input").waitFor({ state: "visible", timeout: 10_000 });
    await popup.locator("#email-input").fill(email);
    await popup.locator("#display-name-input").fill(playerName);
    await popup.getByRole("button", { name: /sign in with google\.com/i }).click();
  }

  await page.waitForURL((url) => url.pathname.startsWith("/setup") || /^\/boards\/[^/]+$/.test(url.pathname));
  if (new URL(page.url()).pathname === "/setup") {
    const nameInput = page.getByLabel("Name");
    await nameInput.fill(playerName);
    await nameInput.press("Enter");
    await page.waitForURL((url) => /^\/boards\/[^/]+$/.test(url.pathname));
  }
}

test("แอดมินและผู้เล่นเห็นการเลือกโฮสต์คนถัดไปพร้อมกัน", async ({ page, browser }, testInfo) => {
  test.setTimeout(180_000);

  const [firestoreReset, authReset] = await Promise.all([
    fetch(`http://127.0.0.1:${firebaseE2E.emulators.firestore.port}/emulator/v1/projects/demo-retro-room/databases/(default)/documents`, { method: "DELETE" }),
    fetch(`http://127.0.0.1:${firebaseE2E.emulators.auth.port}/emulator/v1/projects/demo-retro-room/accounts`, { method: "DELETE" }),
  ]);
  if (!firestoreReset.ok || !authReset.ok) {
    throw new Error(`Could not reset emulator state: Firestore ${firestoreReset.status}, Auth ${authReset.status}`);
  }

  const playerContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const playerPage = await playerContext.newPage();

  try {
    await signInWithAuthEmulator(page, ADMIN_EMAIL, "E2E Admin");
    const boardId = getCurrentBoardId(page);
    const boardUrl = `/boards/${boardId}`;

    await signInWithAuthEmulator(playerPage, PLAYER_EMAIL, "E2E Player");
    await playerPage.goto(boardUrl);
    await playerPage.getByRole("button", { name: "เข้าร่วมบอร์ด" }).click();
    await expect(playerPage.getByRole("heading", { name: "My Retro" })).toBeVisible();

    await page.getByRole("button", { name: /PRESS START/ }).click();
    await expect(page.getByRole("region", { name: "ขั้นตอนของเซสชัน" })).toBeVisible();
    for (let phase = 2; phase <= 5; phase++) {
      await page.getByRole("button", { name: /ขั้นถัดไป/ }).click();
      await expect(page.locator(".phase-title")).toContainText(`ขั้นที่ ${phase}:`);
    }

    const setup = page.getByRole("region", { name: "เลือกผู้เล่นเริ่มเกม" });
    await expect(setup.getByLabel("E2E Player")).toBeChecked();
    await setup.getByRole("button", { name: "เริ่มเกม" }).click();
    await page.getByRole("button", { name: "เปิดร้านค้า" }).click();
    await page.getByRole("button", { name: "ปิดร้านค้า" }).click();

    for (let turn = 0; turn < 5; turn++) {
      await page.getByRole("button", { name: "หมุนวงล้อ", exact: true }).click();
      for (let eventNumber = 0; eventNumber < 2; eventNumber++) {
        const eventSpin = page.getByRole("button", { name: /หมุนวงล้อเหตุการณ์|หมุนเหตุการณ์เพิ่มเติม/ });
        await expect(eventSpin).toBeVisible();
        await eventSpin.click();
        const resolve = page.getByRole("button", { name: "สรุปผลเหตุการณ์" });
        await expect(resolve).toBeEnabled({ timeout: 10_000 });
        await resolve.click();
        const nextTurn = page.getByRole("button", { name: "ไปยังรอบถัดไป" });
        await expect.poll(async () => (await nextTurn.isVisible()) || (await eventSpin.isVisible()), { timeout: 15_000 }).toBe(true);
        if (await nextTurn.isVisible()) break;
      }
      await page.getByRole("button", { name: "ไปยังรอบถัดไป" }).click();
      if (turn < 4) await expect(page.locator(".chaos-turn")).toContainText(`รอบที่ ${turn + 2}`);
    }

    await expect(page.locator(".chaos-phase")).toHaveText("เลือกโฮสต์คนถัดไป");
    await expect(playerPage.locator(".chaos-phase")).toHaveText("เลือกโฮสต์คนถัดไป");
    await expect(page.getByRole("button", { name: "หมุนวงล้อ", exact: true })).toBeEnabled();
    await expect(playerPage.getByRole("button", { name: "หมุนวงล้อ", exact: true })).toBeDisabled();
    await page.screenshot({ path: testInfo.outputPath("admin-next-host-before-spin.png"), fullPage: true });
    await playerPage.screenshot({ path: testInfo.outputPath("player-next-host-before-spin.png"), fullPage: true });

    await page.getByRole("button", { name: "หมุนวงล้อ", exact: true }).click();
    await expect(page.locator(".chaos-dialogue")).toContainText("โฮสต์คนถัดไป: E2E Player");
    await expect(playerPage.locator(".chaos-dialogue")).toContainText("โฮสต์คนถัดไป: E2E Player", { timeout: 10_000 });
    await playerPage.screenshot({ path: testInfo.outputPath("player-next-host-after-spin.png"), fullPage: true });
  } finally {
    await playerContext.close();
  }
});
