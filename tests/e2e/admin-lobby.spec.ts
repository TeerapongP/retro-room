import { expect, test, type Page } from "@playwright/test";
import { BASE_URL, getCurrentBoardId, mockSignIn } from "./helpers";

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

test("แอดมินที่ไม่ใช่สมาชิกดูห้องและเตะผู้เล่นได้", async ({ page }, testInfo) => {
  const boardId = await seedLobby(page);

  await expect(page.getByRole("heading", { name: "E2E Admin Lobby" })).toBeVisible();
  await expect(page.getByTestId("game-admin")).toContainText("Aomsin");
  await expect(page.getByRole("button", { name: "เตะ May ออกจากบอร์ด" })).toBeVisible();
  await expect(page.getByTestId("game-admin")).toBeVisible();
  await expect(page.getByTestId("game-admin").getByRole("img", { name: "ผู้ดูแลเกม" })).toBeVisible();
  await expect(page.locator('[data-testid="title-member-mock-nok"]')).toContainText("โฮสต์");
  await page.screenshot({ path: testInfo.outputPath("admin-lobby.png"), fullPage: true });

  await page.getByRole("button", { name: "เตะ May ออกจากบอร์ด" }).click();
  await page.getByRole("button", { name: "เตะออกจากบอร์ด" }).click();
  await expect(page.locator('[data-testid="title-member-mock-may"]')).toHaveCount(0);

  await switchMockAccount(page, "mock-may", boardId);
  await expect(page.getByRole("button", { name: "เข้าร่วมบอร์ด" })).toBeVisible();
  await expect(page.getByRole("button", { name: /เตะ/ })).toHaveCount(0);
});

test("ผู้เล่นทั่วไปเห็นโฮสต์แต่ไม่เห็นคำสั่งแอดมิน", async ({ page }, testInfo) => {
  const boardId = await seedLobby(page);
  await switchMockAccount(page, "mock-ploy", boardId);

  await expect(page.getByRole("heading", { name: "E2E Admin Lobby" })).toBeVisible();
  await expect(page.locator('[data-testid="title-member-mock-nok"]')).toContainText("โฮสต์");
  await expect(page.getByTestId("game-admin")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /เตะ/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /PRESS START/ })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("player-lobby.png"), fullPage: true });
});

test("แอดมินที่อยู่ในรายชื่อมีมงกุฎและเตะตัวเองไม่ได้", async ({ page }, testInfo) => {
  await mockSignIn(page);
  const boardId = getCurrentBoardId(page);
  await page.evaluate(({ key, id }) => {
    const raw = localStorage.getItem(key);
    if (!raw) throw new Error("Mock state is unavailable");
    const state = JSON.parse(raw) as { boards: Record<string, { hostUid?: string | null }> };
    state.boards[id].hostUid = "mock-ploy";
    localStorage.setItem(key, JSON.stringify(state));
  }, { key: MOCK_STATE_KEY, id: boardId });
  await page.goto(BASE_URL + "/boards/" + boardId);

  await expect(page.getByTestId("game-admin").getByRole("img", { name: "ผู้ดูแลเกม" })).toBeVisible();
  await expect(page.getByText("สมาชิกที่เข้าร่วมแล้ว (6)")).toBeVisible();
  await expect(page.getByTestId("title-member-mock-ploy")).toHaveCount(1);
  await expect(page.getByTestId("title-member-mock-admin")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "เตะ Aomsin ออกจากบอร์ด" })).toHaveCount(0);
  await expect(page.getByTestId("title-member-mock-ploy")).toContainText("โฮสต์");
  await page.screenshot({ path: testInfo.outputPath("admin-member-lobby.png"), fullPage: true });
});



