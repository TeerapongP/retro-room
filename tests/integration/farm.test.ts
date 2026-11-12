import { collection, doc, getDoc, getDocs, serverTimestamp, writeBatch } from "firebase/firestore";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ADMIN_EMAIL } from "@/lib/firebase/admin";
import { createBoard, joinBoard, setPhase, startSession, subscribeToBoard, subscribeToMembers } from "@/lib/firebase/boards";
import {
  cancelFarmGame,
  chooseFarmField,
  finishFarmGame,
  handOverHost,
  newFarmGameId,
  startFarmGame,
  storeCancelledFarmFallback,
  subscribeToFarmChoices,
  subscribeToFarmGame,
  subscribeToMyFarmChoice,
} from "@/lib/firebase/farm";
import type { Board, BoardMember } from "@/lib/firebase/types";
import {
  candidateUidsOf,
  excludedHostUids,
  farmDeadlineMillis,
  isFarmPlayer,
  isPersistedWinnerConsistent,
  revealFarmGame,
  type FarmChoice,
  type FarmFieldId,
  type FarmGame,
} from "@/lib/crowded-farm";
import { createTestUser, pause, reconnectTestUser, resetEmulators, waitUntil, type TestUser } from "./helpers";

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
  await reconnectClients();
}

/**
 * The Rules emulator fixes `request.time` per connection at its first request, so after a real-time wait the clients
 * that were already connected would still look "before the deadline" to the Rules. Production evaluates the time per
 * request. Reconnecting is also what a refresh does, so the tests keep the same uids.
 */
async function reconnectClients(): Promise<void> {
  [owner, second, third, admin] = await Promise.all([owner, second, third, admin].map(reconnectTestUser));
}

/**
 * Lists the choices through a fresh connection: the Rules emulator keeps the read time of a connection fixed at its
 * first read, so a client that was already connected before the deadline would still look "before the deadline".
 * A fresh client also has no local cache, so the first snapshot is the server's full list.
 */
async function readChoices(viewer: TestUser, gameId: string): Promise<FarmChoice[]> {
  const fresh = await reconnectTestUser(viewer);
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
      fresh.db,
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
    // A fresh client has no local cache: a cached snapshot of the member's own choice must not pass for a list.
    const stopList = subscribeToFarmChoices(
      boardId,
      firstGameId,
      () => fail("the list must not open"),
      (error) => (listError = error),
      (await reconnectTestUser(second)).db,
    );
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
    await expect(finishFarmGame(boardId, firstGameId, second.uid, "direct", admin.db)).rejects.toMatchObject(permissionDenied);
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
        return revealFarmGame(firstGameId, players.map((player) => player.uid), await readChoices(viewer, firstGameId), [owner.uid]);
      }),
    );
    memberLists.forEach((list) => list.stop());
    expect(results[1]).toEqual(results[0]);
    expect(results[2]).toEqual(results[0]);
    expect(results[0].hasExplicitChoice).toBe(true);
  });

  it("should store exactly one result when two finishes run at once and never overwrite it", async () => {
    const outcomes = await Promise.allSettled([
      finishFarmGame(boardId, firstGameId, second.uid, "tie-wheel", admin.db),
      finishFarmGame(boardId, firstGameId, third.uid, "tie-wheel", admin.db),
    ]);
    const fulfilled = outcomes.flatMap((outcome, index) => (outcome.status === "fulfilled" ? [index] : []));
    const rejected = outcomes.filter((outcome): outcome is PromiseRejectedResult => outcome.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(["already-resolved", "permission-denied", "aborted"]).toContain((rejected[0].reason as { code: string }).code);

    const winnerUid = fulfilled[0] === 0 ? second.uid : third.uid;
    const game = await readGame(firstGameId);
    expect(game).toMatchObject({ status: "finished", resolution: "tie-wheel", winnerUid });
    const board = await currentBoard();
    expect(board).toMatchObject({ nextHostUid: winnerUid, nextHostGameId: firstGameId });
    expect(board.nextHostSpunAt).toBeInstanceOf(Date);

    await expect(finishFarmGame(boardId, firstGameId, second.uid, "direct", admin.db)).rejects.toMatchObject({ code: "already-resolved" });
    expect((await readGame(firstGameId)).winnerUid).toBe(winnerUid);
  });

  it("should flag a stored winner that the revealed choices do not allow", async () => {
    const members = readMembers(owner);
    await waitUntil(() => members.read().length === 4);
    const game = await readGame(firstGameId);
    const players = members.read().filter((member) => isFarmPlayer(member.joinedAt, game.startedAt));
    members.stop();
    const reveal = revealFarmGame(firstGameId, players.map((player) => player.uid), await readChoices(owner, firstGameId), [owner.uid]);
    expect(isPersistedWinnerConsistent(reveal.outcome, "someone-outside")).toBe(false);
    expect(isPersistedWinnerConsistent(reveal.outcome, game.winnerUid!)).toBe(
      candidateUidsOf(reveal.outcome).includes(game.winnerUid!),
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
      finishFarmGame(boardId, activeGameId, second.uid, "tie-wheel", admin.db),
      cancelFarmGame(boardId, activeGameId, admin.db),
    ]);
    expect([finishOutcome.status, cancelOutcome.status].filter((status) => status === "fulfilled")).toHaveLength(1);
    const game = await readGame(activeGameId);
    const board = await currentBoard();
    if (finishOutcome.status === "fulfilled") {
      expect(game).toMatchObject({ status: "finished", winnerUid: second.uid });
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
      storeCancelledFarmFallback(boardId, activeGameId, second.uid, admin.db),
      storeCancelledFarmFallback(boardId, activeGameId, third.uid, admin.db),
    ]);
    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    const rejected = outcomes.find((outcome): outcome is PromiseRejectedResult => outcome.status === "rejected")!;
    expect(["already-resolved", "permission-denied", "aborted"]).toContain((rejected.reason as { code: string }).code);

    board = await currentBoard();
    const storedWinner = outcomes[0].status === "fulfilled" ? second.uid : third.uid;
    expect(board).toMatchObject({ nextHostUid: storedWinner, nextHostGameId: activeGameId });
    expect((await readGame(activeGameId)).winnerUid).toBeNull();

    const nextGameId = newFarmGameId(boardId, admin.db);
    await startFarmGame(boardId, nextGameId, admin.db);

    await expect(storeCancelledFarmFallback(boardId, activeGameId, third.uid, admin.db)).rejects.toBeTruthy();
    const afterStale = await currentBoard();
    expect(afterStale.nextHostUid).toBe(storedWinner);
    expect(afterStale.farmActiveGameId).toBe(nextGameId);
  }, 30_000);

  it("should keep every round as its own document", async () => {
    const games = await getDocs(collection(admin.db, "boards", boardId, "farmGames"));
    expect(games.size).toBeGreaterThanOrEqual(3);
  });

  it("should let a reconnecting client recover the round, its own choice and the stored state", async () => {
    const reconnected = await reconnectTestUser(second);
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
});

/**
 * Host eligibility on a second board (F30, D163 to D166). The owner hosts first. Everybody plays and scores; only the
 * current Host and the previous Hosts are left out of the next-Host choice, and a person who was merely selected is
 * not a previous Host until the role is handed over.
 */
describe("Host eligibility on the emulators (D163 to D166)", () => {
  let fourth: TestUser;

  beforeAll(async () => {
    fourth = await createTestUser("farm-fourth", "Fourth");
    boardId = await createBoard(owner.user, "Host board", owner.name, owner.db);
    await joinBoard(boardId, second.user, second.name, second.db);
    await joinBoard(boardId, third.user, third.name, third.db);
    await joinBoard(boardId, fourth.user, fourth.name, fourth.db);
    await startSession(boardId, owner.db);
    await setPhase(boardId, 5, admin.db);
  }, 30_000);

  const everyone = () => [owner, second, third, fourth];

  async function startRound(): Promise<string> {
    const gameId = newFarmGameId(boardId, admin.db);
    await startFarmGame(boardId, gameId, admin.db);
    return gameId;
  }

  async function choose(gameId: string, picks: Array<[TestUser, FarmFieldId]>): Promise<void> {
    for (const [user, field] of picks) await chooseFarmField(boardId, gameId, user.uid, field, user.db);
  }

  /** The result as one client works it out: members, the revealed choices and the Host data of the board. */
  async function revealAs(viewer: TestUser, gameId: string) {
    const members = readMembers(viewer);
    await waitUntil(() => members.read().length === 4);
    const game = await readGame(gameId);
    const players = members.read().filter((member) => isFarmPlayer(member.joinedAt, game.startedAt));
    members.stop();
    const choices = await readChoices(viewer, gameId);
    return revealFarmGame(gameId, players.map((player) => player.uid), choices, excludedHostUids(await currentBoard()));
  }

  async function revealAsEveryClient(gameId: string) {
    const results = [];
    for (const viewer of [owner, second, third, fourth]) results.push(await revealAs(viewer, gameId));
    for (const result of results) expect(result).toEqual(results[0]);
    return results[0];
  }

  /** Finishes through the batch the Rules see, skipping the client's own check, to prove the Rules refuse it too. */
  async function rawFinish(gameId: string, winnerUid: string, resolution: string): Promise<void> {
    const batch = writeBatch(admin.db);
    batch.update(doc(admin.db, "boards", boardId, "farmGames", gameId), {
      status: "finished",
      resolution,
      winnerUid,
      resolvedAt: serverTimestamp(),
    });
    batch.update(doc(admin.db, "boards", boardId), {
      nextHostUid: winnerUid,
      nextHostGameId: gameId,
      updatedAt: serverTimestamp(),
      ...(resolution === "direct" ? {} : { nextHostSpunAt: serverTimestamp() }),
    });
    await batch.commit();
  }

  const hostExcluded = { code: "host-excluded" };

  it("should score every player, pass over a top group that holds only the Host, and pick the next group directly", async () => {
    const gameId = await startRound();
    // The Host (owner) alone on strawberry has the top score 8.00; carrot holds the eligible fourth with 6.00.
    await choose(gameId, [[owner, "strawberry"], [second, "corn"], [third, "corn"], [fourth, "carrot"]]);
    await waitForDeadline(gameId);

    const reveal = await revealAsEveryClient(gameId);
    expect(reveal.tallies.map((tally) => [tally.field.id, tally.playerCount])).toEqual([
      ["carrot", 1],
      ["corn", 2],
      ["strawberry", 1],
    ]);
    expect(reveal.tallies.find((tally) => tally.field.id === "strawberry")).toMatchObject({ isBest: true, isBestEligible: false });
    expect(reveal.outcome).toEqual({ kind: "direct", winnerUid: fourth.uid });
    expect(reveal.excludedUids).toEqual([owner.uid]);

    await expect(finishFarmGame(boardId, gameId, owner.uid, "direct", admin.db)).rejects.toMatchObject(hostExcluded);
    await expect(rawFinish(gameId, owner.uid, "direct")).rejects.toMatchObject(permissionDenied);
    await finishFarmGame(boardId, gameId, fourth.uid, "direct", admin.db);
    expect(await currentBoard()).toMatchObject({ nextHostUid: fourth.uid, nextHostGameId: gameId, hostUid: null, pastHostUids: [] });
  }, 60_000);

  it("should keep only the eligible players in a tie and refuse the Host in the stored tie result", async () => {
    const gameId = await startRound();
    await choose(gameId, everyone().map((user): [TestUser, FarmFieldId] => [user, "corn"]));
    await waitForDeadline(gameId);

    const reveal = await revealAsEveryClient(gameId);
    expect(reveal.outcome).toEqual({ kind: "tie-wheel", candidateUids: [second.uid, third.uid, fourth.uid].sort() });
    expect(reveal.tallies.find((tally) => tally.field.id === "corn")?.playerCount).toBe(4);

    await expect(finishFarmGame(boardId, gameId, owner.uid, "tie-wheel", admin.db)).rejects.toMatchObject(hostExcluded);
    await expect(rawFinish(gameId, owner.uid, "tie-wheel")).rejects.toMatchObject(permissionDenied);
    await finishFarmGame(boardId, gameId, second.uid, "tie-wheel", admin.db);
    expect(await currentBoard()).toMatchObject({ nextHostUid: second.uid, hostUid: null, pastHostUids: [] });
  }, 60_000);

  it("should wheel only the eligible players when nobody chooses, and leave the selected winner a non-previous Host", async () => {
    const gameId = await startRound();
    await waitForDeadline(gameId);
    const reveal = await revealAsEveryClient(gameId);
    expect(reveal.hasExplicitChoice).toBe(false);
    expect(reveal.outcome).toEqual({ kind: "all-wheel", candidateUids: [second.uid, third.uid, fourth.uid].sort() });
    await expect(rawFinish(gameId, owner.uid, "all-wheel")).rejects.toMatchObject(permissionDenied);
    await finishFarmGame(boardId, gameId, third.uid, "all-wheel", admin.db);
    // Selected twice, never handed the role: still neither the Host nor a previous Host.
    expect(excludedHostUids(await currentBoard())).toEqual([owner.uid]);
  }, 60_000);

  it("should refuse the Host in the cancelled fallback, then hand the role over once and keep no duplicate", async () => {
    const gameId = await startRound();
    await cancelFarmGame(boardId, gameId, admin.db);
    await expect(storeCancelledFarmFallback(boardId, gameId, owner.uid, admin.db)).rejects.toMatchObject(hostExcluded);
    await storeCancelledFarmFallback(boardId, gameId, second.uid, admin.db);

    await handOverHost(boardId, admin.db);
    expect(await currentBoard()).toMatchObject({ hostUid: second.uid, pastHostUids: [owner.uid], nextHostUid: second.uid });
    await expect(handOverHost(boardId, admin.db)).rejects.toMatchObject(hostExcluded);
    expect((await currentBoard()).pastHostUids).toEqual([owner.uid]);
  }, 30_000);

  it("should exclude the new Host and the previous Host in the next round, for every client and after a reconnect", async () => {
    const gameId = await startRound();
    await choose(gameId, [[second, "strawberry"], [third, "corn"], [fourth, "corn"], [owner, "carrot"]]);
    await waitForDeadline(gameId);

    // strawberry 8.00 holds only second (the new Host) and carrot 6.00 only the owner (a past Host), so the best group
    // with eligible players is corn 3.50 with third and fourth.
    const reveal = await revealAsEveryClient(gameId);
    expect(reveal.excludedUids).toEqual([owner.uid, second.uid].sort());
    expect(reveal.outcome).toEqual({ kind: "tie-wheel", candidateUids: [third.uid, fourth.uid].sort() });

    await expect(finishFarmGame(boardId, gameId, second.uid, "tie-wheel", admin.db)).rejects.toMatchObject(hostExcluded);
    await expect(rawFinish(gameId, owner.uid, "tie-wheel")).rejects.toMatchObject(permissionDenied);
    await finishFarmGame(boardId, gameId, fourth.uid, "tie-wheel", admin.db);

    const refreshed = await reconnectTestUser(third);
    let board: Board | null = null;
    const stop = subscribeToBoard(boardId, (next) => (board = next), fail, refreshed.db);
    await waitUntil(() => board !== null);
    stop();
    expect(excludedHostUids(board!)).toEqual([owner.uid, second.uid].sort());
  }, 60_000);

  it("should never select an excluded player when every player is the Host or a previous Host", async () => {
    await handOverHost(boardId, admin.db);
    expect(await currentBoard()).toMatchObject({ hostUid: fourth.uid, pastHostUids: [owner.uid, second.uid] });

    // third is the only one left: hand the role to third through a cancelled round's fallback.
    const fallbackGameId = await startRound();
    await cancelFarmGame(boardId, fallbackGameId, admin.db);
    await storeCancelledFarmFallback(boardId, fallbackGameId, third.uid, admin.db);
    await handOverHost(boardId, admin.db);
    expect(excludedHostUids(await currentBoard())).toEqual(everyone().map((user) => user.uid).sort());

    const gameId = await startRound();
    await choose(gameId, [[owner, "corn"], [second, "carrot"], [third, "carrot"], [fourth, "strawberry"]]);
    await waitForDeadline(gameId);
    const reveal = await revealAsEveryClient(gameId);
    expect(reveal.outcome).toEqual({ kind: "none" });
    expect(reveal.tallies.reduce((sum, tally) => sum + tally.playerCount, 0)).toBe(4);
    for (const user of everyone()) {
      await expect(finishFarmGame(boardId, gameId, user.uid, "tie-wheel", admin.db)).rejects.toMatchObject(hostExcluded);
      await expect(rawFinish(gameId, user.uid, "tie-wheel")).rejects.toMatchObject(permissionDenied);
    }

    await cancelFarmGame(boardId, gameId, admin.db);
    for (const user of everyone()) {
      await expect(storeCancelledFarmFallback(boardId, gameId, user.uid, admin.db)).rejects.toMatchObject(hostExcluded);
    }
    expect((await currentBoard()).nextHostGameId).not.toBe(gameId);
  }, 90_000);
});
