import { expect, test, type Page } from "@playwright/test";
import { BASE_URL, mockSignIn } from "./helpers";

const MOCK_STATE_KEY = "retro-room:mock-state";

type MockLobbyBackend = {
  createBoard: (uid: string, title: string, playerName: string) => Promise<string>;
  joinBoard: (boardId: string, uid: string, playerName: string) => Promise<void>;
};

async function seedLobby(page: Page): Promise<string> {
  await mockSignIn(page);
  await page.waitForFunction(() =>
    typeof (window as Window & { __retroRoomMockBackend?: MockLobbyBackend }).__retroRoomMockBackend !== "undefined",
  );

  const boardId = await page.evaluate(async (stateKey) => {
    const backend = (window as Window & { __retroRoomMockBackend?: MockLobbyBackend }).__retroRoomMockBackend;
    if (!backend) throw new Error("Mock backend is unavailable");

    const id = await backend.createBoard("mock-ploy", "E2E Admin Lobby", "Ploy");
    await backend.joinBoard(id, "mock-nok", "Nok");
    await backend.joinBoard(id, "mock-may", "May");

    const raw = localStorage.getItem(stateKey);
    if (!raw) throw new Error("Mock state is unavailable");
    const state = JSON.parse(raw) as {
      session: string | null;
      boards: Record<string, { hostUid?: string | null }>;
    };
    state.session = "mock-admin";
    state.boards[id].hostUid = "mock-nok";
    localStorage.setItem(stateKey, JSON.stringify(state));
    return id;
  }, MOCK_STATE_KEY);

  await page.goto(BASE_URL + "/boards/" + boardId);
  return boardId;
}

async function switchMockAccount(page: Page, uid: string, boardId: string): Promise<void> {
  await page.evaluate(
    ({ key, nextUid }) => {
      const raw = localStorage.getItem(key);
      if (!raw) throw new Error("Mock state is unavailable");
      const state = JSON.parse(raw) as { session: string | null };
      state.session = nextUid;
      localStorage.setItem(key, JSON.stringify(state));
    },
    { key: MOCK_STATE_KEY, nextUid: uid },
  );
  await page.goto(BASE_URL + "/boards/" + boardId);
}

test("แอดมินที่ไม่ใช่สมาชิกดูห้องและเตะผู้เล่นได้", async ({ page }) => {
  const boardId = await seedLobby(page);

  await expect(page.getByRole("heading", { name: "E2E Admin Lobby" })).toBeVisible();
  await expect(page.getByRole("button", { name: "เตะ May ออกจากบอร์ด" })).toBeVisible();
  await expect(page.locator('[data-testid="title-member-nok"]')).toContainText("โฮสต์");

  await page.getByRole("button", { name: "เตะ May ออกจากบอร์ด" }).click();
  await page.getByRole("button", { name: "เตะออกจากบอร์ด" }).click();
  await expect(page.locator('[data-testid="title-member-may"]')).toHaveCount(0);

  await switchMockAccount(page, "mock-may", boardId);
  await expect(page.getByRole("heading", { name: /เข้าร่วมบอร์ด/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /เตะ/ })).toHaveCount(0);
});

test("ผู้เล่นทั่วไปเห็นโฮสต์แต่ไม่เห็นคำสั่งแอดมิน", async ({ page }) => {
  const boardId = await seedLobby(page);
  await switchMockAccount(page, "mock-ploy", boardId);

  await expect(page.getByRole("heading", { name: "E2E Admin Lobby" })).toBeVisible();
  await expect(page.locator('[data-testid="title-member-nok"]')).toContainText("โฮสต์");
  await expect(page.getByRole("button", { name: /เตะ/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /PRESS START/ })).toHaveCount(0);
});



