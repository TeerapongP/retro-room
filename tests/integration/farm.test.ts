import { collection, disableNetwork, doc, enableNetwork, getDoc, getDocs } from "firebase/firestore";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ADMIN_EMAIL } from "@/lib/firebase/admin";
import { createBoard, joinBoard, setPhase, startSession, subscribeToBoard, subscribeToMembers } from "@/lib/firebase/boards";
import {
  cancelFarmGame,
  chooseFarmField,
  finishFarmGame,
  newFarmGameId,
  startFarmGame,
  storeCancelledFarmFallback,
  subscribeToFarmChoices,
  subscribeToFarmGame,
  subscribeToMyFarmChoice,
} from "@/lib/firebase/farm";
import type { Board, BoardMember } from "@/lib/firebase/types";
import {
  farmDeadlineMillis,
  isFarmPlayer,
  isPersistedWinnerConsistent,
  revealFarmGame,
  type FarmChoice,
  type FarmFieldId,
  type FarmGame,
} from "@/lib/crowded-farm";
import { createTestUser, pause, resetEmulators, waitUntil, type TestUser } from "./helpers";

/**
 * Crowded Farm against the emulators. These tests share one board and run in order, because the 15 second
 * deadline is real time. An emulator run shows how the Rules and the transactions behave there; it does not prove
 * how production serializes concurrent requests.
 */

let owner: TestUser;
let second: TestUser;
let third: TestUser;
let admin: TestUser;
let boardId: string;
let firstGameId: string;

const fail = (error: unknown) => {
  throw error;
};

beforeAll(async () => {
  await resetEmulators();
  owner = await createTestUser("farm-owner", "Owner");
  second = await createTestUser("farm-second", "Second");
  third = await createTestUser("farm-third", "Third");
  admin = await createTestUser("farm-admin", "Admin", { email: ADMIN_EMAIL });
  boardId = await createBoard(owner.user, "Farm board", owner.name, owner.db);
  await joinBoard(boardId, second.user, second.name, second.db);
  await joinBoard(boardId, third.user, third.name, third.db);
  await startSession(boardId, owner.db);
  await setPhase(boardId, 5, admin.db);
}, 30_000);

afterAll(async () => {
  await resetEmulators();
});

function readMembers(viewer: TestUser): { read: () => BoardMember[]; stop: () => void } {
  let members: BoardMember[] = [];
  const stop = subscribeToMembers(boardId, (next) => (members = next), fail, viewer.db);
  return { read: () => members, stop };
}

async function currentBoard(): Promise<Board> {
  let board: Board | null = null;
  const stop = subscribeToBoard(boardId, (next) => (board = next), fail, owner.db);
  await waitUntil(() => board !== null);
  stop();
  return board!;
}

async function readGame(gameId: string): Promise<FarmGame> {
  let game: FarmGame | null | undefined;
  const stop = subscribeToFarmGame(boardId, gameId, (next) => (game = next), fail, owner.db);
  await waitUntil(() => game !== undefined);
  stop();
  if (!game) throw new Error(`game ${gameId} does not exist`);
  return game;
}

async function waitForDeadline(gameId: string): Promise<void> {
  const game = await readGame(gameId);
  const waitMs = farmDeadlineMillis(game.startedAt!) + 1500 - Date.now();
  if (waitMs > 0) await pause(waitMs);
}

function readChoices(viewer: TestUser, gameId: string): Promise<FarmChoice[]> {
  return new Promise((resolve, reject) => {
    const stop = subscribeToFarmChoices(
      boardId,
      gameId,
      (choices) => {
        stop();
        resolve(choices);
      },
      (error) => {
        stop();
        reject(new Error(`${viewer.name} could not list the choices: ${(error as { code?: string }).code}`));
      },
      viewer.db,
    );
  });
}

const permissionDenied = { code: "permission-denied" };

describe("Crowded Farm on the emulators (D153 to D162)", () => {
  it("should let exactly one of two concurrent starts win and leave no game for the loser", async () => {
    const firstCandidate = newFarmGameId(boardId, admin.db);
    const secondCandidate = newFarmGameId(boardId, admin.db);
    const outcomes = await Promise.allSettled([
      startFarmGame(boardId, firstCandidate, admin.db),
      startFarmGame(boardId, secondCandidate, admin.db),
    ]);
    const winners = outcomes.filter((outcome) => outcome.status === "fulfilled");
    const losers = outcomes.filter((outcome): outcome is PromiseRejectedResult => outcome.status === "rejected");
    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(1);
    expect(["round-in-progress", "permission-denied", "aborted"]).toContain((losers[0].reason as { code: string }).code);

    firstGameId = outcomes[0].status === "fulfilled" ? firstCandidate : secondCandidate;
    const loserGameId = firstGameId === firstCandidate ? secondCandidate : firstCandidate;
    expect((await currentBoard()).farmActiveGameId).toBe(firstGameId);
    expect((await getDoc(doc(admin.db, "boards", boardId, "farmGames", loserGameId))).exists()).toBe(false);
  }, 30_000);

  it("should refuse a third start while the round is selecting", async () => {
    await expect(startFarmGame(boardId, newFarmGameId(boardId, admin.db), admin.db)).rejects.toMatchObject({
      code: "round-in-progress",
    });
  });

  it("should accept choices right after the start and keep them private until the deadline", async () => {
    await chooseFarmField(boardId, firstGameId, owner.uid, "strawberry", owner.db);
    await chooseFarmField(boardId, firstGameId, second.uid, "carrot", second.db);
    await chooseFarmField(boardId, firstGameId, second.uid, "corn", second.db);

    let ownChoice: FarmFieldId | null = null;
    const stopOwn = subscribeToMyFarmChoice(boardId, firstGameId, second.uid, (next) => (ownChoice = next), fail, second.db);
    await waitUntil(() => ownChoice === "corn");
    stopOwn();

    let listError: unknown;
    const stopList = subscribeToFarmChoices(boardId, firstGameId, () => fail("the list must not open"), (error) => (listError = error), second.db);
    await waitUntil(() => listError !== undefined);
    stopList();
    expect(listError).toMatchObject(permissionDenied);
    await expect(getDoc(doc(second.db, "boards", boardId, "farmGames", firstGameId, "choices", owner.uid))).rejects.toMatchObject(
      permissionDenied,
    );
  });

  it("should leave out a member who joins after the round started", async () => {
    const late = await createTestUser("farm-late", "Late");
    await joinBoard(boardId, late.user, late.name, late.db);
    await expect(chooseFarmField(boardId, firstGameId, late.uid, "corn", late.db)).rejects.toMatchObject(permissionDenied);

    const members = readMembers(owner);
    await waitUntil(() => members.read().length === 4);
    const game = await readGame(firstGameId);
    const players = members.read().filter((member) => isFarmPlayer(member.joinedAt, game.startedAt));
    members.stop();
    expect(players.map((player) => player.uid).sort()).toEqual([owner.uid, second.uid, third.uid].sort());
  });

  it("should refuse to finish before the deadline", async () => {
    await expect(finishFarmGame(boardId, firstGameId, owner.uid, "direct", admin.db)).rejects.toMatchObject(permissionDenied);
  });

  it("should reject a choice after 15 seconds, and open the choices to every member and the admin", async () => {
    await waitForDeadline(firstGameId);
    await expect(chooseFarmField(boardId, firstGameId, third.uid, "carrot", third.db)).rejects.toMatchObject(permissionDenied);

    const seenBy: FarmChoice[][] = [];
    for (const viewer of [owner, second, third, admin]) seenBy.push(await readChoices(viewer, firstGameId));
    for (const choices of seenBy) {
      expect(choices.map((choice) => `${choice.uid}:${choice.field}`).sort()).toEqual(
        [`${owner.uid}:strawberry`, `${second.uid}:corn`].sort(),
      );
    }
  }, 40_000);

  it("should give every client the same result from the revealed choices", async () => {
    const memberLists = [owner, second, third].map(readMembers);
    await waitUntil(() => memberLists.every((list) => list.read().length === 4));
    const game = await readGame(firstGameId);
    const results = await Promise.all(
      [owner, second, third].map(async (viewer, index) => {
        const players = memberLists[index].read().filter((member) => isFarmPlayer(member.joinedAt, game.startedAt));
        return revealFarmGame(firstGameId, players.map((player) => player.uid), await readChoices(viewer, firstGameId));
      }),
    );
    memberLists.forEach((list) => list.stop());
    expect(results[1]).toEqual(results[0]);
    expect(results[2]).toEqual(results[0]);
    expect(results[0].hasExplicitChoice).toBe(true);
  });

  it("should store exactly one result when two finishes run at once and never overwrite it", async () => {
    const outcomes = await Promise.allSettled([
      finishFarmGame(boardId, firstGameId, owner.uid, "tie-wheel", admin.db),
      finishFarmGame(boardId, firstGameId, second.uid, "tie-wheel", admin.db),
    ]);
    const fulfilled = outcomes.flatMap((outcome, index) => (outcome.status === "fulfilled" ? [index] : []));
    const rejected = outcomes.filter((outcome): outcome is PromiseRejectedResult => outcome.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(["already-resolved", "permission-denied", "aborted"]).toContain((rejected[0].reason as { code: string }).code);

    const winnerUid = fulfilled[0] === 0 ? owner.uid : second.uid;
    const game = await readGame(firstGameId);
    expect(game).toMatchObject({ status: "finished", resolution: "tie-wheel", winnerUid });
    const board = await currentBoard();
    expect(board).toMatchObject({ nextHostUid: winnerUid, nextHostGameId: firstGameId });
    expect(board.nextHostSpunAt).toBeInstanceOf(Date);

    await expect(finishFarmGame(boardId, firstGameId, third.uid, "direct", admin.db)).rejects.toMatchObject({ code: "already-resolved" });
    expect((await readGame(firstGameId)).winnerUid).toBe(winnerUid);
  });

  it("should flag a stored winner that the revealed choices do not allow", async () => {
    const members = readMembers(owner);
    await waitUntil(() => members.read().length === 4);
    const game = await readGame(firstGameId);
    const players = members.read().filter((member) => isFarmPlayer(member.joinedAt, game.startedAt));
    members.stop();
    const reveal = revealFarmGame(firstGameId, players.map((player) => player.uid), await readChoices(owner, firstGameId));
    expect(isPersistedWinnerConsistent(reveal.outcome, "someone-outside")).toBe(false);
    expect(isPersistedWinnerConsistent(reveal.outcome, game.winnerUid!)).toBe(
      reveal.outcome.kind === "direct" ? reveal.outcome.winnerUid === game.winnerUid : reveal.outcome.candidateUids.includes(game.winnerUid!),
    );
  });

  it("should replay with a new game id and keep the old round", async () => {
    const secondGameId = newFarmGameId(boardId, admin.db);
    await startFarmGame(boardId, secondGameId, admin.db);
    expect(secondGameId).not.toBe(firstGameId);
    expect((await currentBoard()).farmActiveGameId).toBe(secondGameId);
    expect(await readGame(firstGameId)).toMatchObject({ status: "finished" });

    await chooseFarmField(boardId, secondGameId, owner.uid, "corn", owner.db);
    await expect(chooseFarmField(boardId, firstGameId, owner.uid, "corn", owner.db)).rejects.toMatchObject(permissionDenied);
  });

  it("should leave exactly one terminal state when a finish and a cancel race", async () => {
    const activeGameId = (await currentBoard()).farmActiveGameId!;
    await waitForDeadline(activeGameId);
    const [finishOutcome, cancelOutcome] = await Promise.allSettled([
      finishFarmGame(boardId, activeGameId, owner.uid, "tie-wheel", admin.db),
      cancelFarmGame(boardId, activeGameId, admin.db),
    ]);
    expect([finishOutcome.status, cancelOutcome.status].filter((status) => status === "fulfilled")).toHaveLength(1);
    const game = await readGame(activeGameId);
    const board = await currentBoard();
    if (finishOutcome.status === "fulfilled") {
      expect(game).toMatchObject({ status: "finished", winnerUid: owner.uid });
      expect(board.nextHostGameId).toBe(activeGameId);
    } else {
      expect(game.status).toBe("cancelled");
      expect(game.winnerUid).toBeNull();
      expect(board.nextHostGameId).not.toBe(activeGameId);
    }
  }, 40_000);

  it("should store the fallback wheel result of a cancelled round once, and only then allow a new round", async () => {
    let board = await currentBoard();
    let activeGameId = board.farmActiveGameId!;
    if ((await readGame(activeGameId)).status === "finished") {
      activeGameId = newFarmGameId(boardId, admin.db);
      await startFarmGame(boardId, activeGameId, admin.db);
      await cancelFarmGame(boardId, activeGameId, admin.db);
    }
    expect(board.nextHostGameId).not.toBe(activeGameId);

    await expect(startFarmGame(boardId, newFarmGameId(boardId, admin.db), admin.db)).rejects.toMatchObject({ code: "fallback-pending" });
    await expect(cancelFarmGame(boardId, activeGameId, admin.db)).rejects.toMatchObject({ code: "already-resolved" });

    const outcomes = await Promise.allSettled([
      storeCancelledFarmFallback(boardId, activeGameId, owner.uid, admin.db),
      storeCancelledFarmFallback(boardId, activeGameId, third.uid, admin.db),
    ]);
    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    const rejected = outcomes.find((outcome): outcome is PromiseRejectedResult => outcome.status === "rejected")!;
    expect(["already-resolved", "permission-denied", "aborted"]).toContain((rejected.reason as { code: string }).code);

    board = await currentBoard();
    const storedWinner = outcomes[0].status === "fulfilled" ? owner.uid : third.uid;
    expect(board).toMatchObject({ nextHostUid: storedWinner, nextHostGameId: activeGameId });
    expect((await readGame(activeGameId)).winnerUid).toBeNull();

    const nextGameId = newFarmGameId(boardId, admin.db);
    await startFarmGame(boardId, nextGameId, admin.db);

    await expect(storeCancelledFarmFallback(boardId, activeGameId, second.uid, admin.db)).rejects.toBeTruthy();
    const afterStale = await currentBoard();
    expect(afterStale.nextHostUid).toBe(storedWinner);
    expect(afterStale.farmActiveGameId).toBe(nextGameId);
  }, 30_000);

  it("should keep every round as its own document", async () => {
    const games = await getDocs(collection(admin.db, "boards", boardId, "farmGames"));
    expect(games.size).toBeGreaterThanOrEqual(3);
  });

  it("should let a reconnecting client recover the round, its own choice and the stored state", async () => {
    const reconnected = await createTestUser("farm-second", "Second");
    expect(reconnected.uid).toBe(second.uid);
    const activeGameId = (await currentBoard()).farmActiveGameId!;
    expect(await (async () => {
      let ownChoice: FarmFieldId | null | undefined;
      const stop = subscribeToMyFarmChoice(boardId, activeGameId, reconnected.uid, (next) => (ownChoice = next), fail, reconnected.db);
      await waitUntil(() => ownChoice !== undefined);
      stop();
      return ownChoice;
    })()).toBeNull();
    expect((await readGame(activeGameId)).status).toBe("selecting");
  });

  it("should refuse to start a round while the client is offline", async () => {
    await disableNetwork(admin.db);
    try {
      await cancelFarmGame(boardId, (await currentBoard()).farmActiveGameId!, admin.db).then(
        () => expect.unreachable("an offline transaction must not succeed"),
        (error) => expect(typeof (error as { code?: unknown }).code).toBe("string"),
      );
    } finally {
      await enableNetwork(admin.db);
    }
  }, 40_000);
});
