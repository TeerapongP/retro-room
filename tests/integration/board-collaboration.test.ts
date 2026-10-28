import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createBoard,
  getOwnMembership,
  joinBoard,
  completeSession,
  startSession,
  subscribeToBoard,
  subscribeToMembers,
  subscribeToMemberships,
} from "@/lib/firebase/boards";
import { addCard, deleteCard, editCard, subscribeToCards } from "@/lib/firebase/cards";
import type { Board, BoardCard, BoardMember, DashboardBoard } from "@/lib/firebase/types";
import { createTestUser, pause, resetEmulators, waitUntil, type TestUser } from "./helpers";

let userA: TestUser;
let userB: TestUser;
let userC: TestUser;

beforeEach(async () => {
  await resetEmulators();
  userA = await createTestUser("user-a", "User A");
  userB = await createTestUser("user-b", "User B");
  userC = await createTestUser("user-c", "User C");
});

afterEach(async () => {
  await resetEmulators();
});

async function createBoardAsA(title = "Sprint 1"): Promise<string> {
  return createBoard(userA.user, title, userA.name, userA.db);
}

describe("board creation and sharing", () => {
  it(`should give the creator an owner membership when a board is created`, async () => {
    const boardId = await createBoardAsA();

    const membership = await getOwnMembership(boardId, userA.uid, userA.db);

    expect(membership).toMatchObject({ uid: userA.uid, role: "owner", displayName: "User A" });
  });

  it(`should let a second user see the board but not a membership when opening the shared link`, async () => {
    const boardId = await createBoardAsA("Shared board");
    let board: Board | null | undefined;
    const unsubscribe = subscribeToBoard(boardId, (next) => (board = next), fail, userB.db);

    await waitUntil(() => board !== undefined);
    const membership = await getOwnMembership(boardId, userB.uid, userB.db);
    unsubscribe();

    expect(board?.title).toBe("Shared board");
    expect(membership).toBeNull();
  });

  it(`should report a missing board as null when the link is wrong`, async () => {
    let board: Board | null | undefined;
    const unsubscribe = subscribeToBoard("doesNotExist", (next) => (board = next), fail, userB.db);

    await waitUntil(() => board !== undefined);
    unsubscribe();

    expect(board).toBeNull();
  });

  it(`should add the second user as member when they join`, async () => {
    const boardId = await createBoardAsA();

    await joinBoard(boardId, userB.user, userB.name, userB.db);

    expect(await getOwnMembership(boardId, userB.uid, userB.db)).toMatchObject({
      role: "member",
      displayName: "User B",
    });
  });

  it(`should reject joining twice when already a member`, async () => {
    const boardId = await createBoardAsA();
    await joinBoard(boardId, userB.user, userB.name, userB.db);

    await expect(joinBoard(boardId, userB.user, userB.name, userB.db)).rejects.toMatchObject({
      code: "permission-denied",
    });
  });

  it(`should deny joining a board that does not exist when the link is wrong`, async () => {
    await expect(joinBoard("doesNotExist", userB.user, userB.name, userB.db)).rejects.toMatchObject({
      code: "permission-denied",
    });
  });
});

describe("membership views", () => {
  it(`should list only own boards on the dashboard, newest joined first`, async () => {
    const firstBoardId = await createBoardAsA("First");
    await pause(50);
    const secondBoardId = await createBoardAsA("Second");
    await joinBoard(firstBoardId, userB.user, userB.name, userB.db);
    let boardsOfA: DashboardBoard[] | undefined;
    let boardsOfB: DashboardBoard[] | undefined;
    let boardsOfC: DashboardBoard[] | undefined;
    const unsubscribers = [
      subscribeToMemberships(userA.uid, (next) => (boardsOfA = next), fail, userA.db),
      subscribeToMemberships(userB.uid, (next) => (boardsOfB = next), fail, userB.db),
      subscribeToMemberships(userC.uid, (next) => (boardsOfC = next), fail, userC.db),
    ];

    await waitUntil(() => !!boardsOfA && !!boardsOfB && !!boardsOfC);
    unsubscribers.forEach((unsubscribe) => unsubscribe());

    expect(boardsOfA?.map((board) => board.boardId)).toEqual([secondBoardId, firstBoardId]);
    expect(boardsOfB?.map((board) => [board.boardId, board.role])).toEqual([[firstBoardId, "member"]]);
    expect(boardsOfC).toEqual([]);
  });

  it(`should show the member list to members when someone joins`, async () => {
    const boardId = await createBoardAsA();
    let members: BoardMember[] = [];
    const unsubscribe = subscribeToMembers(boardId, (next) => (members = next), fail, userA.db);
    await waitUntil(() => members.length === 1);

    await joinBoard(boardId, userB.user, userB.name, userB.db);
    await waitUntil(() => members.length === 2);
    unsubscribe();

    expect(members.map((member) => member.displayName).sort()).toEqual(["User A", "User B"]);
  });

  it(`should deny reading the member list when not a member`, async () => {
    const boardId = await createBoardAsA();
    let errorCode: string | undefined;
    const unsubscribe = subscribeToMembers(
      boardId,
      () => {},
      (error) => (errorCode = (error as { code: string }).code),
      userC.db,
    );

    await waitUntil(() => errorCode !== undefined);
    unsubscribe();

    expect(errorCode).toBe("permission-denied");
  });
});

describe("session lifecycle", () => {
  function watchBoard(boardId: string, user: TestUser) {
    const state = { board: undefined as Board | null | undefined };
    const unsubscribe = subscribeToBoard(boardId, (next) => (state.board = next), fail, user.db);
    return { state, unsubscribe };
  }

  it(`should create boards in the waiting status`, async () => {
    const boardId = await createBoardAsA();
    const watcher = watchBoard(boardId, userA);

    await waitUntil(() => watcher.state.board !== undefined);
    watcher.unsubscribe();

    expect(watcher.state.board?.status).toBe("waiting");
  });

  it(`should move the member into the session in real time when the owner starts`, async () => {
    const boardId = await createBoardAsA();
    await joinBoard(boardId, userB.user, userB.name, userB.db);
    const watcherB = watchBoard(boardId, userB);
    await waitUntil(() => watcherB.state.board?.status === "waiting");

    await startSession(boardId, userA.db);
    await waitUntil(() => watcherB.state.board?.status === "in-progress");
    watcherB.unsubscribe();
  });

  it(`should deny a member and a non-member starting the session`, async () => {
    const boardId = await createBoardAsA();
    await joinBoard(boardId, userB.user, userB.name, userB.db);

    await expect(startSession(boardId, userB.db)).rejects.toMatchObject({ code: "permission-denied" });
    await expect(startSession(boardId, userC.db)).rejects.toMatchObject({ code: "permission-denied" });
  });

  it(`should deny adding cards before the session starts`, async () => {
    const boardId = await createBoardAsA();
    await joinBoard(boardId, userB.user, userB.name, userB.db);

    await expect(
      addCard(boardId, userB.user, "ideas", "Too early", userB.db),
    ).rejects.toMatchObject({ code: "permission-denied" });
  });

  it(`should keep a completed session read-only and not restartable`, async () => {
    const boardId = await createBoardAsA();
    await joinBoard(boardId, userB.user, userB.name, userB.db);
    await startSession(boardId, userA.db);
    await addCard(boardId, userB.user, "ideas", "Kept", userB.db);

    await expect(completeSession(boardId, userB.db)).rejects.toMatchObject({ code: "permission-denied" });
    await completeSession(boardId, userA.db);

    await expect(
      addCard(boardId, userB.user, "ideas", "Too late", userB.db),
    ).rejects.toMatchObject({ code: "permission-denied" });
    await expect(startSession(boardId, userA.db)).rejects.toMatchObject({ code: "permission-denied" });
    const watcherB = { cards: undefined as BoardCard[] | undefined };
    const unsubscribe = subscribeToCards(boardId, (next) => (watcherB.cards = next), fail, userB.db);
    await waitUntil(() => watcherB.cards !== undefined);
    unsubscribe();
    expect(watcherB.cards?.map((card) => card.text)).toEqual(["Kept"]);
  });
});

describe("real-time cards", () => {
  async function boardWithAAndB(): Promise<string> {
    const boardId = await createBoardAsA();
    await joinBoard(boardId, userB.user, userB.name, userB.db);
    await startSession(boardId, userA.db);
    return boardId;
  }

  function watchCards(boardId: string, user: TestUser) {
    const state = { cards: undefined as BoardCard[] | undefined, calls: 0 };
    const unsubscribe = subscribeToCards(
      boardId,
      (next) => {
        state.cards = next;
        state.calls += 1;
      },
      fail,
      user.db,
    );
    return { state, unsubscribe };
  }

  it(`should deliver a card from user A to user B without reloading when A adds it`, async () => {
    const boardId = await boardWithAAndB();
    const watcherB = watchCards(boardId, userB);
    await waitUntil(() => watcherB.state.cards !== undefined);

    await addCard(boardId, userA.user, "went-well", "Shipped on time", userA.db);
    await waitUntil(() => watcherB.state.cards?.length === 1);
    watcherB.unsubscribe();

    expect(watcherB.state.cards?.[0]).toMatchObject({
      text: "Shipped on time",
      columnId: "went-well",
      authorId: userA.uid,
    });
  });

  it(`should let both users see edits and deletes of their own cards in real time`, async () => {
    const boardId = await boardWithAAndB();
    const watcherA = watchCards(boardId, userA);
    await addCard(boardId, userB.user, "ideas", "First draft", userB.db);
    await waitUntil(() => watcherA.state.cards?.length === 1);
    const cardId = watcherA.state.cards![0].id;

    await editCard(boardId, cardId, "Edited", userB.db);
    await waitUntil(() => watcherA.state.cards?.[0]?.text === "Edited");
    await deleteCard(boardId, cardId, userB.db);
    await waitUntil(() => watcherA.state.cards?.length === 0);
    watcherA.unsubscribe();
  });

  it(`should deny a member editing or deleting another member's card`, async () => {
    const boardId = await boardWithAAndB();
    await addCard(boardId, userA.user, "to-improve", "A's card", userA.db);
    const watcherA = watchCards(boardId, userA);
    await waitUntil(() => watcherA.state.cards?.length === 1);
    const cardId = watcherA.state.cards![0].id;
    watcherA.unsubscribe();

    await expect(editCard(boardId, cardId, "Hacked", userB.db)).rejects.toMatchObject({
      code: "permission-denied",
    });
    await expect(deleteCard(boardId, cardId, userB.db)).rejects.toMatchObject({
      code: "permission-denied",
    });
  });

  it(`should let the owner delete a member's card`, async () => {
    const boardId = await boardWithAAndB();
    await addCard(boardId, userB.user, "ideas", "B's card", userB.db);
    const watcherA = watchCards(boardId, userA);
    await waitUntil(() => watcherA.state.cards?.length === 1);

    await deleteCard(boardId, watcherA.state.cards![0].id, userA.db);
    await waitUntil(() => watcherA.state.cards?.length === 0);
    watcherA.unsubscribe();
  });

  it(`should deny reading and writing cards when not a member`, async () => {
    const boardId = await boardWithAAndB();
    let errorCode: string | undefined;
    const unsubscribe = subscribeToCards(
      boardId,
      () => {},
      (error) => (errorCode = (error as { code: string }).code),
      userC.db,
    );

    await waitUntil(() => errorCode !== undefined);
    unsubscribe();

    expect(errorCode).toBe("permission-denied");
    await expect(
      addCard(boardId, userC.user, "ideas", "Intruder", userC.db),
    ).rejects.toMatchObject({ code: "permission-denied" });
  });

  it(`should stop delivering updates when the listener is unsubscribed`, async () => {
    const boardId = await boardWithAAndB();
    const watcherB = watchCards(boardId, userB);
    await waitUntil(() => watcherB.state.cards !== undefined);
    watcherB.unsubscribe();
    const callsAfterUnsubscribe = watcherB.state.calls;

    await addCard(boardId, userA.user, "ideas", "Late card", userA.db);
    await pause(400);

    expect(watcherB.state.calls).toBe(callsAfterUnsubscribe);
  });
});

function fail(error: unknown): never {
  throw error instanceof Error ? error : new Error(String(error));
}
