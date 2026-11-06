import { describe, expect, it } from "vitest";
import { ADMIN_EMAIL } from "../../lib/firebase/admin";
import { createMockBackend } from "../../lib/mock/backend";
import type { BoardCard } from "../../lib/firebase/types";

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  };
}

function setup(options: { storage?: ReturnType<typeof memoryStorage> } = {}) {
  let clock = Date.parse("2026-11-06T10:00:00Z");
  const backend = createMockBackend({ storage: options.storage, now: () => new Date((clock += 1000)) });
  return backend;
}

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe("mock auth", () => {
  it("should start signed out and sign in as the verified admin when asked", async () => {
    const backend = setup();
    expect(backend.getCurrentUser()).toBeNull();

    const user = await backend.signIn();

    expect(user).toMatchObject({ email: ADMIN_EMAIL, emailVerified: true });
    expect(backend.getCurrentUser()?.uid).toBe(user.uid);
  });

  it("should notify auth listeners on sign in and sign out", async () => {
    const backend = setup();
    const seen: Array<string | null> = [];
    const stop = backend.onAuthChange((user) => seen.push(user?.uid ?? null));
    await flush();

    await backend.signIn();
    await backend.signOut();
    stop();
    await backend.signIn();

    expect(seen).toEqual([null, expect.any(String), null]);
  });

  it("should give the signed-in admin a player name and accept a first-time name once", async () => {
    const backend = setup();
    const admin = await backend.signIn();
    expect(await backend.getPlayerName(admin.uid)).toBe("Aomsin");

    expect(await backend.getPlayerName("someone-new")).toBeNull();
    expect(await backend.savePlayerName("someone-new", "  Pim  ")).toBe("Pim");
    expect(await backend.getPlayerName("someone-new")).toBe("Pim");
    await expect(backend.savePlayerName("someone-new", "Other")).rejects.toThrow();
    await expect(backend.savePlayerName("another", "   ")).rejects.toThrow();
  });
});

describe("mock boards", () => {
  it("should create a waiting board with an owner membership that shows on the dashboard", async () => {
    const backend = setup();
    const user = await backend.signIn();

    const boardId = await backend.createBoard(user.uid, "Sprint 20", "Aomsin");

    const boards: Array<{ boardId: string; title: string; role: string }> = [];
    const stop = backend.subscribeToMemberships(user.uid, (next) => boards.splice(0, boards.length, ...next), fail);
    await flush();
    stop();
    expect(boards[0]).toMatchObject({ boardId, title: "Sprint 20", role: "owner" });
    expect((await backend.getOwnMembership(boardId, user.uid))?.role).toBe("owner");
  });

  it("should start and complete a session and tell board listeners", async () => {
    const backend = setup();
    const user = await backend.signIn();
    const boardId = await backend.createBoard(user.uid, "Flow", "Aomsin");
    const statuses: string[] = [];
    const stop = backend.subscribeToBoard(boardId, (board) => board && statuses.push(board.status), fail);
    await flush();

    await backend.startSession(boardId);
    await backend.completeSession(boardId);
    stop();

    expect(statuses).toEqual(["waiting", "in-progress", "completed"]);
  });

  it("should add a member when a user joins and report a missing membership as null before", async () => {
    const backend = setup();
    const user = await backend.signIn();
    const boardId = await backend.createBoard(user.uid, "Join me", "Aomsin");

    expect(await backend.getOwnMembership(boardId, "guest")).toBeNull();
    await backend.joinBoard(boardId, "guest", "Guest");

    expect((await backend.getOwnMembership(boardId, "guest"))?.role).toBe("member");
    const names: string[] = [];
    const stop = backend.subscribeToMembers(boardId, (members) => names.splice(0, names.length, ...members.map((m) => m.displayName)), fail);
    await flush();
    stop();
    expect(names).toEqual(["Aomsin", "Guest"]);
  });
});

describe("mock cards", () => {
  async function liveBoard() {
    const backend = setup();
    const admin = await backend.signIn();
    const boardId = await backend.createBoard(admin.uid, "Cards", "Aomsin");
    await backend.joinBoard(boardId, "guest", "Guest");
    await backend.startSession(boardId);
    return { backend, admin, boardId };
  }

  function watch(backend: ReturnType<typeof setup>, boardId: string, uid: string, isAdmin: boolean) {
    const state = { cards: [] as BoardCard[] };
    const stop = backend.subscribeToCards(boardId, { uid, isAdmin }, (next) => (state.cards = next), fail);
    return { state, stop };
  }

  it("should add, edit and delete a card and keep creation order", async () => {
    const { backend, admin, boardId } = await liveBoard();
    const view = watch(backend, boardId, admin.uid, true);

    await backend.addCard(boardId, admin.uid, "ideas", "First");
    await backend.addCard(boardId, admin.uid, "ideas", "Second");
    await flush();
    expect(view.state.cards.map((card) => card.text)).toEqual(["First", "Second"]);
    expect(view.state.cards[0]).toMatchObject({ hidden: false, authorId: admin.uid, columnId: "ideas" });

    await backend.editCard(boardId, view.state.cards[0].id, "First edited");
    await backend.deleteCard(boardId, view.state.cards[1].id);
    view.stop();
    expect(view.state.cards.map((card) => card.text)).toEqual(["First edited"]);
  });

  it("should hide a card from other members but not from its author or the admin", async () => {
    const { backend, admin, boardId } = await liveBoard();
    await backend.addCard(boardId, "guest", "to-improve", "Private");
    await backend.addCard(boardId, admin.uid, "to-improve", "Open");
    const adminView = watch(backend, boardId, admin.uid, true);
    const guestView = watch(backend, boardId, "guest", false);
    const otherView = watch(backend, boardId, "third", false);
    await flush();
    const privateCard = adminView.state.cards.find((card) => card.text === "Private")!;

    await backend.setCardHidden(boardId, privateCard.id, true);

    expect(otherView.state.cards.map((card) => card.text)).toEqual(["Open"]);
    expect(guestView.state.cards.map((card) => card.text).sort()).toEqual(["Open", "Private"]);
    expect(adminView.state.cards.find((card) => card.id === privateCard.id)?.hidden).toBe(true);

    await backend.setCardHidden(boardId, privateCard.id, false);
    expect(otherView.state.cards).toHaveLength(2);
    for (const view of [adminView, guestView, otherView]) view.stop();
  });

  it("should move a card to the end of another in-progress board keeping author, text and hidden state", async () => {
    const { backend, admin, boardId } = await liveBoard();
    const destination = await backend.createBoard(admin.uid, "Destination", "Aomsin");
    await backend.startSession(destination);
    await backend.addCard(destination, admin.uid, "ideas", "Already there");
    await backend.addCard(boardId, "guest", "went-well", "Move me");
    const sourceView = watch(backend, boardId, admin.uid, true);
    await flush();
    const card = sourceView.state.cards[0];
    await backend.setCardHidden(boardId, card.id, true);

    await backend.moveCard(boardId, { ...card, hidden: true }, destination);

    const destinationView = watch(backend, destination, admin.uid, true);
    await flush();
    expect(sourceView.state.cards).toEqual([]);
    expect(destinationView.state.cards.map((c) => c.text)).toEqual(["Already there", "Move me"]);
    expect(destinationView.state.cards[1]).toMatchObject({ authorId: "guest", hidden: true, columnId: "went-well" });
    sourceView.stop();
    destinationView.stop();
  });

  it("should list only other in-progress boards as move targets", async () => {
    const { backend, admin, boardId } = await liveBoard();
    const second = await backend.createBoard(admin.uid, "Second", "Aomsin");
    await backend.startSession(second);
    const finished = await backend.createBoard(admin.uid, "Finished", "Aomsin");
    await backend.startSession(finished);
    await backend.completeSession(finished);
    const waiting = await backend.createBoard(admin.uid, "Waiting", "Aomsin");

    const titles = (await backend.listMoveTargetBoards(boardId)).map((board) => board.title);

    expect(titles).toContain("Second");
    expect(titles).not.toContain("Finished");
    expect(titles).not.toContain("Waiting");
    expect(titles).not.toContain("Cards");
    expect(waiting).toBeTruthy();
  });
});

describe("mock persistence and seed", () => {
  it("should seed two in-progress demo boards for the mock admin", async () => {
    const backend = setup();
    const user = await backend.signIn();
    const titles: string[] = [];
    const stop = backend.subscribeToMemberships(user.uid, (boards) => titles.splice(0, titles.length, ...boards.map((b) => b.title)), fail);
    await flush();
    stop();
    expect(titles.sort()).toEqual(["Sprint 12", "Sprint 13"]);
  });

  it("should restore boards and the session from storage in a new backend", async () => {
    const storage = memoryStorage();
    const first = setup({ storage });
    const user = await first.signIn();
    const boardId = await first.createBoard(user.uid, "Remember me", "Aomsin");

    const second = setup({ storage });

    expect(second.getCurrentUser()?.uid).toBe(user.uid);
    expect((await second.getOwnMembership(boardId, user.uid))?.role).toBe("owner");
  });

  it("should ignore a broken stored state and start from the seed", () => {
    const storage = memoryStorage();
    storage.setItem("retro-room:mock-state", "{not json");
    expect(setup({ storage }).getCurrentUser()).toBeNull();
  });
});

function fail(error: unknown): never {
  throw error;
}
