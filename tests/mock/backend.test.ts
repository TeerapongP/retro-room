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

describe("mock private writing step", () => {
  it("should show members only their own cards in step 1, everyone's from step 2, and everything once completed", async () => {
    const backend = setup();
    const admin = await backend.signIn();
    const boardId = await backend.createBoard(admin.uid, "Private", "Aomsin");
    await backend.joinBoard(boardId, "guest", "Guest");
    await backend.startSession(boardId);
    await backend.addCard(boardId, admin.uid, "ideas", "Owner card");
    await backend.addCard(boardId, "guest", "ideas", "Guest card");
    const guestView = { cards: [] as BoardCard[] };
    const adminView = { cards: [] as BoardCard[] };
    const stopGuest = backend.subscribeToCards(boardId, { uid: "guest", isAdmin: false }, (next) => (guestView.cards = next), fail);
    const stopAdmin = backend.subscribeToCards(boardId, { uid: admin.uid, isAdmin: true }, (next) => (adminView.cards = next), fail);
    await flush();
    expect(guestView.cards.map((card) => card.text)).toEqual(["Guest card"]);
    expect(adminView.cards).toHaveLength(2);

    await backend.setPhase(boardId, 2);
    expect(guestView.cards).toHaveLength(2);

    await backend.setPhase(boardId, 1);
    expect(guestView.cards.map((card) => card.text)).toEqual(["Guest card"]);

    await backend.completeSession(boardId);
    stopGuest();
    stopAdmin();
    expect(guestView.cards).toHaveLength(2);
  });
});

describe("mock self rating", () => {
  async function ratingBoard() {
    const backend = setup();
    const admin = await backend.signIn();
    const boardId = await backend.createBoard(admin.uid, "Ratings", "Aomsin");
    await backend.joinBoard(boardId, "guest", "Guest");
    await backend.startSession(boardId);
    await backend.setPhase(boardId, 4);
    return { backend, admin, boardId };
  }

  it("should save scores, let listeners see every member and allow changing them in step 4", async () => {
    const { backend, admin, boardId } = await ratingBoard();
    let ratings: Array<{ uid: string; score: number }> = [];
    const stop = backend.subscribeToRatings(boardId, (next) => (ratings = next), fail);
    await flush();

    await backend.saveMyRating(boardId, admin.uid, 4.5);
    await backend.saveMyRating(boardId, "guest", 3);
    await backend.saveMyRating(boardId, admin.uid, 5);
    stop();

    expect(ratings.find((rating) => rating.uid === admin.uid)?.score).toBe(5);
    expect(ratings.find((rating) => rating.uid === "guest")?.score).toBe(3);
  });

  it("should refuse bad scores, a non-member and ratings outside step 4", async () => {
    const { backend, admin, boardId } = await ratingBoard();
    for (const bad of [0, 0.5, 5.5, 1.2]) {
      await expect(backend.saveMyRating(boardId, admin.uid, bad)).rejects.toMatchObject({ code: "permission-denied" });
    }
    await expect(backend.saveMyRating(boardId, "stranger", 3)).rejects.toMatchObject({ code: "permission-denied" });
    await backend.setPhase(boardId, 3);
    await expect(backend.saveMyRating(boardId, admin.uid, 3)).rejects.toMatchObject({ code: "permission-denied" });
  });
});

describe("mock voting", () => {
  async function votingBoard() {
    const backend = setup();
    const admin = await backend.signIn();
    const boardId = await backend.createBoard(admin.uid, "Votes", "Aomsin");
    await backend.joinBoard(boardId, "guest", "Guest");
    await backend.startSession(boardId);
    await backend.setPhase(boardId, 3);
    return { backend, admin, boardId };
  }

  it("should save votes, let listeners see every voter and allow changing them in step 3", async () => {
    const { backend, admin, boardId } = await votingBoard();
    let voters: Array<{ uid: string; cardIds: string[] }> = [];
    const stop = backend.subscribeToVotes(boardId, (next) => (voters = next), fail);
    await flush();

    await backend.saveMyVotes(boardId, admin.uid, ["c1", "c2"]);
    await backend.saveMyVotes(boardId, "guest", ["c1"]);
    await backend.saveMyVotes(boardId, admin.uid, ["c2"]);
    stop();

    expect(voters.find((voter) => voter.uid === admin.uid)?.cardIds).toEqual(["c2"]);
    expect(voters.find((voter) => voter.uid === "guest")?.cardIds).toEqual(["c1"]);
  });

  it("should refuse a fourth vote, repeated ids, a non-member and votes outside step 3", async () => {
    const { backend, admin, boardId } = await votingBoard();
    await expect(backend.saveMyVotes(boardId, admin.uid, ["a", "b", "c", "d"])).rejects.toMatchObject({ code: "permission-denied" });
    await expect(backend.saveMyVotes(boardId, admin.uid, ["a", "a"])).rejects.toMatchObject({ code: "permission-denied" });
    await expect(backend.saveMyVotes(boardId, "stranger", ["a"])).rejects.toMatchObject({ code: "permission-denied" });
    await backend.setPhase(boardId, 4);
    await expect(backend.saveMyVotes(boardId, admin.uid, ["a"])).rejects.toMatchObject({ code: "permission-denied" });
  });

  it("should keep votes after a reload from storage", async () => {
    const storage = memoryStorage();
    const first = setup({ storage });
    const admin = await first.signIn();
    const boardId = await first.createBoard(admin.uid, "Votes", "Aomsin");
    await first.startSession(boardId);
    await first.setPhase(boardId, 3);
    await first.saveMyVotes(boardId, admin.uid, ["c1"]);

    let voters: Array<{ uid: string; cardIds: string[] }> = [];
    const stop = setup({ storage }).subscribeToVotes(boardId, (next) => (voters = next), fail);
    await flush();
    stop();
    expect(voters).toEqual([{ uid: admin.uid, cardIds: ["c1"] }]);
  });
});

describe("mock writing only in step 1", () => {
  it("should reject new cards from step 2 on and accept them again in step 1", async () => {
    const backend = setup();
    const admin = await backend.signIn();
    const boardId = await backend.createBoard(admin.uid, "Closed", "Aomsin");
    await expect(backend.addCard(boardId, admin.uid, "ideas", "Before start")).rejects.toMatchObject({ code: "permission-denied" });
    await backend.startSession(boardId);
    await backend.addCard(boardId, admin.uid, "ideas", "In step 1");

    await backend.setPhase(boardId, 2);
    await expect(backend.addCard(boardId, admin.uid, "ideas", "In review")).rejects.toMatchObject({ code: "permission-denied" });

    await backend.setPhase(boardId, 1);
    await backend.addCard(boardId, admin.uid, "ideas", "Back in step 1");
  });
});

describe("mock session step", () => {
  it("should start at step 1, follow setPhase for board listeners and survive a reload", async () => {
    const storage = memoryStorage();
    const backend = setup({ storage });
    const user = await backend.signIn();
    const boardId = await backend.createBoard(user.uid, "Steps", "Aomsin");
    await backend.startSession(boardId);
    const phases: number[] = [];
    const stop = backend.subscribeToBoard(boardId, (board) => board && phases.push(board.phase), fail);
    await flush();

    await backend.setPhase(boardId, 2);
    await backend.setPhase(boardId, 6);
    stop();

    expect(phases).toEqual([1, 2, 6]);
    const reloaded: number[] = [];
    const stopReloaded = setup({ storage }).subscribeToBoard(boardId, (board) => board && reloaded.push(board.phase), fail);
    await flush();
    stopReloaded();
    expect(reloaded).toEqual([6]);
  });
});

describe("mock board timer", () => {
  it("should start a timer that board listeners see, and stop it again", async () => {
    const backend = setup();
    const user = await backend.signIn();
    const boardId = await backend.createBoard(user.uid, "Timed", "Aomsin");
    await backend.startSession(boardId);
    const seen: Array<{ endsAt: Date | null; duration: number | null }> = [];
    const stop = backend.subscribeToBoard(
      boardId,
      (board) => board && seen.push({ endsAt: board.timerEndsAt, duration: board.timerDurationSec }),
      fail,
    );
    await flush();

    await backend.startTimer(boardId, 5);
    await backend.stopTimer(boardId);
    stop();

    expect(seen[0]).toEqual({ endsAt: null, duration: null });
    expect(seen[1].duration).toBe(300);
    expect(seen[1].endsAt).toBeInstanceOf(Date);
    expect(seen[2]).toEqual({ endsAt: null, duration: null });
  });

  it("should keep the timer after a reload from storage", async () => {
    const storage = memoryStorage();
    const first = setup({ storage });
    const user = await first.signIn();
    const boardId = await first.createBoard(user.uid, "Timed", "Aomsin");
    await first.startSession(boardId);
    await first.startTimer(boardId, 10);

    const second = setup({ storage });
    const boards: Array<number | null> = [];
    const stop = second.subscribeToBoard(boardId, (board) => board && boards.push(board.timerDurationSec), fail);
    await flush();
    stop();
    expect(boards).toEqual([600]);
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
    await backend.setPhase(boardId, 2); // others' cards show from step 2 (D126)
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

  it("should move a card to another column and keep its text, author and hidden state", async () => {
    const { backend, admin, boardId } = await liveBoard();
    await backend.addCard(boardId, "guest", "went-well", "Wrong column");
    const view = watch(backend, boardId, admin.uid, true);
    await flush();
    const card = view.state.cards[0];

    await backend.setCardColumn(boardId, card.id, "to-improve");
    await backend.setCardColumn(boardId, card.id, "ideas");

    view.stop();
    expect(view.state.cards).toHaveLength(1);
    expect(view.state.cards[0]).toMatchObject({
      id: card.id,
      columnId: "ideas",
      text: "Wrong column",
      authorId: "guest",
      hidden: false,
    });
  });

  it("should stack a card onto another, moving it into the target's column, and unstack it again", async () => {
    const { backend, admin, boardId } = await liveBoard();
    await backend.addCard(boardId, "guest", "went-well", "Target");
    await backend.addCard(boardId, "guest", "ideas", "Dragged");
    const view = watch(backend, boardId, admin.uid, true);
    await flush();
    const target = view.state.cards.find((card) => card.text === "Target")!;
    const dragged = view.state.cards.find((card) => card.text === "Dragged")!;

    await backend.stackCards(boardId, dragged.id, target.id);

    const stacked = view.state.cards;
    expect(stacked.find((card) => card.id === target.id)).toMatchObject({ groupId: target.id, columnId: "went-well" });
    expect(stacked.find((card) => card.id === dragged.id)).toMatchObject({ groupId: target.id, columnId: "went-well" });

    await backend.unstackCard(boardId, dragged.id);
    view.stop();
    expect(view.state.cards.find((card) => card.id === dragged.id)?.groupId).toBeNull();
    expect(view.state.cards.find((card) => card.id === target.id)?.groupId).toBe(target.id);
  });

  it("should join an existing stack instead of starting a new one", async () => {
    const { backend, admin, boardId } = await liveBoard();
    for (const text of ["One", "Two", "Three"]) await backend.addCard(boardId, "guest", "ideas", text);
    const view = watch(backend, boardId, admin.uid, true);
    await flush();
    const [one, two, three] = view.state.cards;

    await backend.stackCards(boardId, two.id, one.id);
    await backend.stackCards(boardId, three.id, two.id);

    view.stop();
    expect(new Set(view.state.cards.map((card) => card.groupId))).toEqual(new Set([one.id]));
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
    expect(titles.sort()).toEqual(["Sprint 13", "Sprint 23"]);
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
