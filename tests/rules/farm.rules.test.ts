import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const ADMIN_EMAIL = "thirapong.pin@ascendcorp.com";
const BOARD = "farm";
const seeded = Timestamp.fromDate(new Date("2026-01-01T00:00:00Z"));

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: "demo-retro-room-farm",
    firestore: { rules: readFileSync(resolve(process.cwd(), "firestore.rules"), "utf8") },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

const admin = () => testEnv.authenticatedContext("admin", { email: ADMIN_EMAIL, email_verified: true }).firestore();
const alice = () => testEnv.authenticatedContext("alice").firestore();
const bob = () => testEnv.authenticatedContext("bob").firestore();
const carol = () => testEnv.authenticatedContext("carol").firestore();
const dave = () => testEnv.authenticatedContext("dave").firestore();
const stranger = () => testEnv.authenticatedContext("stranger").firestore();
const impostors = {
  "unverified account with the admin email": () =>
    testEnv.authenticatedContext("fake", { email: ADMIN_EMAIL, email_verified: false }).firestore(),
  "verified account with another email": () =>
    testEnv.authenticatedContext("other", { email: "someone@ascendcorp.com", email_verified: true }).firestore(),
  "signed-out client": () => testEnv.unauthenticatedContext().firestore(),
};

const secondsFromNow = (seconds: number) => Timestamp.fromMillis(Date.now() + seconds * 1000);

type GameSeed = Record<string, unknown>;

/**
 * Seeds one board in step 5 with alice (owner), bob and carol who joined long ago, and dave who joined just now.
 * Games are seeded directly, so a startedAt in the future keeps the 15 second selection window open for the test
 * and a startedAt in the past makes it closed.
 */
async function seed(options: {
  board?: Record<string, unknown>;
  games?: Record<string, GameSeed>;
  choices?: Record<string, Record<string, string>>;
}) {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, `boards/${BOARD}`), {
      title: "Farm board",
      ownerId: "alice",
      status: "in-progress",
      phase: 5,
      createdAt: seeded,
      updatedAt: seeded,
      ...options.board,
    });
    for (const [uid, role, joinedAt] of [
      ["alice", "owner", seeded],
      ["bob", "member", seeded],
      ["carol", "member", seeded],
      ["dave", "member", Timestamp.now()],
    ] as const) {
      await setDoc(doc(db, `boards/${BOARD}/members/${uid}`), { uid, role, displayName: uid, joinedAt });
    }
    for (const [gameId, data] of Object.entries(options.games ?? {})) {
      await setDoc(doc(db, `boards/${BOARD}/farmGames/${gameId}`), data);
    }
    for (const [gameId, byUid] of Object.entries(options.choices ?? {})) {
      for (const [uid, field] of Object.entries(byUid)) {
        await setDoc(doc(db, `boards/${BOARD}/farmGames/${gameId}/choices/${uid}`), { field, updatedAt: seeded });
      }
    }
  });
}

const openGame = (extra: GameSeed = {}) => ({ startedAt: secondsFromNow(120), status: "selecting", ...extra });
const closedGame = (extra: GameSeed = {}) => ({ startedAt: secondsFromNow(-60), status: "selecting", ...extra });
const justStartedGame = () => ({ startedAt: secondsFromNow(-5), status: "selecting" });
const finishedGame = (winnerUid = "bob") => ({
  startedAt: secondsFromNow(-300),
  status: "finished",
  resolution: "direct",
  winnerUid,
  resolvedAt: secondsFromNow(-250),
});
const cancelledGame = () => ({ startedAt: secondsFromNow(-300), status: "cancelled", resolvedAt: secondsFromNow(-250) });

const gameRef = (client: ReturnType<typeof admin>, gameId: string) => doc(client, `boards/${BOARD}/farmGames/${gameId}`);
const boardRef = (client: ReturnType<typeof admin>) => doc(client, `boards/${BOARD}`);
const choiceRef = (client: ReturnType<typeof admin>, gameId: string, uid: string) =>
  doc(client, `boards/${BOARD}/farmGames/${gameId}/choices/${uid}`);

function startRound(client: ReturnType<typeof admin>, gameId: string) {
  const batch = writeBatch(client);
  batch.set(gameRef(client, gameId), { startedAt: serverTimestamp(), status: "selecting" });
  batch.update(boardRef(client), { farmActiveGameId: gameId, updatedAt: serverTimestamp() });
  return batch.commit();
}

function finishRound(
  client: ReturnType<typeof admin>,
  gameId: string,
  winnerUid: string,
  resolution: string,
  boardExtra: Record<string, unknown> = {},
  gameExtra: Record<string, unknown> = {},
) {
  const batch = writeBatch(client);
  batch.update(gameRef(client, gameId), {
    status: "finished",
    resolution,
    winnerUid,
    resolvedAt: serverTimestamp(),
    ...gameExtra,
  });
  batch.update(boardRef(client), {
    nextHostUid: winnerUid,
    nextHostGameId: gameId,
    updatedAt: serverTimestamp(),
    ...(resolution === "direct" ? {} : { nextHostSpunAt: serverTimestamp() }),
    ...boardExtra,
  });
  return batch.commit();
}

const cancelRound = (client: ReturnType<typeof admin>, gameId: string, extra: Record<string, unknown> = {}) =>
  updateDoc(gameRef(client, gameId), { status: "cancelled", resolvedAt: serverTimestamp(), ...extra });

const storeFallback = (
  client: ReturnType<typeof admin>,
  gameId: string,
  winnerUid: string,
  extra: Record<string, unknown> = {},
) =>
  updateDoc(boardRef(client), {
    nextHostUid: winnerUid,
    nextHostSpunAt: serverTimestamp(),
    nextHostGameId: gameId,
    updatedAt: serverTimestamp(),
    ...extra,
  });

const choose = (client: ReturnType<typeof admin>, gameId: string, uid: string, field: unknown, extra: Record<string, unknown> = {}) =>
  setDoc(choiceRef(client, gameId, uid), { field, updatedAt: serverTimestamp(), ...extra });

describe("starting a round (D153, D155, D156)", () => {
  it("should let the admin start the first round and a round after a finished one", async () => {
    await seed({});
    await assertSucceeds(startRound(admin(), "round1"));

    await seed({ board: { farmActiveGameId: "old", nextHostGameId: "old", nextHostUid: "bob" }, games: { old: finishedGame() } });
    await assertSucceeds(startRound(admin(), "round2"));
  });

  it("should reject the start by anyone but the verified admin", async () => {
    await seed({});
    for (const client of [alice(), bob(), stranger(), ...Object.values(impostors).map((make) => make())]) {
      await assertFails(startRound(client, "round1"));
    }
  });

  it("should reject the start outside step 5 and on a board that is not in progress", async () => {
    await seed({ board: { phase: 4 } });
    await assertFails(startRound(admin(), "round1"));
    await seed({ board: { status: "completed" } });
    await assertFails(startRound(admin(), "round1"));
    await seed({ board: { status: "waiting", phase: 5 } });
    await assertFails(startRound(admin(), "round1"));
  });

  it("should reject a start time the client chose and malformed games", async () => {
    await seed({});
    const db = admin();
    const wrongTime = writeBatch(db);
    wrongTime.set(gameRef(db, "round1"), { startedAt: Timestamp.now(), status: "selecting" });
    wrongTime.update(boardRef(db), { farmActiveGameId: "round1", updatedAt: serverTimestamp() });
    await assertFails(wrongTime.commit());

    const extraField = writeBatch(db);
    extraField.set(gameRef(db, "round1"), { startedAt: serverTimestamp(), status: "selecting", endsAt: serverTimestamp() });
    extraField.update(boardRef(db), { farmActiveGameId: "round1", updatedAt: serverTimestamp() });
    await assertFails(extraField.commit());

    const alreadyFinished = writeBatch(db);
    alreadyFinished.set(gameRef(db, "round1"), { startedAt: serverTimestamp(), status: "finished" });
    alreadyFinished.update(boardRef(db), { farmActiveGameId: "round1", updatedAt: serverTimestamp() });
    await assertFails(alreadyFinished.commit());
  });

  it("should reject a game without the pointer and a pointer without the game", async () => {
    await seed({});
    await assertFails(setDoc(gameRef(admin(), "round1"), { startedAt: serverTimestamp(), status: "selecting" }));
    await assertFails(updateDoc(boardRef(admin()), { farmActiveGameId: "round1", updatedAt: serverTimestamp() }));
  });

  it("should reject a pointer batch that changes other board fields", async () => {
    await seed({});
    const db = admin();
    const batch = writeBatch(db);
    batch.set(gameRef(db, "round1"), { startedAt: serverTimestamp(), status: "selecting" });
    batch.update(boardRef(db), { farmActiveGameId: "round1", updatedAt: serverTimestamp(), phase: 1 });
    await assertFails(batch.commit());
  });

  it("should reject reusing the id of an existing game", async () => {
    await seed({ board: { farmActiveGameId: "old", nextHostGameId: "old" }, games: { old: finishedGame() } });
    await assertFails(startRound(admin(), "old"));
  });

  it("should reject a second start while the first round is selecting, also one after the other", async () => {
    await seed({});
    await assertSucceeds(startRound(admin(), "round1"));
    await assertFails(startRound(admin(), "round2"));
  });

  it("should block a start while a selecting game is active, also one that is past its deadline", async () => {
    await seed({ board: { farmActiveGameId: "open" }, games: { open: openGame() } });
    await assertFails(startRound(admin(), "round2"));
    await seed({ board: { farmActiveGameId: "closed" }, games: { closed: closedGame() } });
    await assertFails(startRound(admin(), "round2"));
  });

  it("should block a start after a cancelled game until its fallback wheel result is stored, and allow it after", async () => {
    await seed({ board: { farmActiveGameId: "cancelled" }, games: { cancelled: cancelledGame() } });
    await assertFails(startRound(admin(), "round2"));

    await assertSucceeds(storeFallback(admin(), "cancelled", "bob"));
    await assertSucceeds(startRound(admin(), "round2"));
  });

  it("should not let the old cancelled game store its result once a new round has started", async () => {
    await seed({ board: { farmActiveGameId: "cancelled" }, games: { cancelled: cancelledGame() } });
    await assertSucceeds(storeFallback(admin(), "cancelled", "bob"));
    await assertSucceeds(startRound(admin(), "round2"));
    await assertFails(storeFallback(admin(), "cancelled", "carol"));
    const board = await getDoc(boardRef(admin()));
    expect(board.data()?.nextHostUid).toBe("bob");
    expect(board.data()?.nextHostGameId).toBe("cancelled");
  });
});

describe("choices (D153, D155)", () => {
  it("should let an eligible member choose and change their field before the deadline", async () => {
    await seed({ board: { farmActiveGameId: "open" }, games: { open: openGame() } });
    await assertSucceeds(choose(bob(), "open", "bob", "corn"));
    await assertSucceeds(choose(bob(), "open", "bob", "strawberry"));
    await assertSucceeds(choose(alice(), "open", "alice", "carrot"));
    await assertSucceeds(choose(carol(), "open", "carol", "corn"));
  });

  it("should reject a choice at or after startedAt plus 15 seconds, and accept one just before", async () => {
    await seed({ board: { farmActiveGameId: "closed" }, games: { closed: closedGame() } });
    await assertFails(choose(bob(), "closed", "bob", "corn"));
    await seed({ board: { farmActiveGameId: "justStarted" }, games: { justStarted: justStartedGame() } });
    await assertSucceeds(choose(bob(), "justStarted", "bob", "corn"));
  });

  it("should reject deleting a choice", async () => {
    await seed({ board: { farmActiveGameId: "open" }, games: { open: openGame() }, choices: { open: { bob: "corn" } } });
    await assertFails(deleteDoc(choiceRef(bob(), "open", "bob")));
  });

  it("should reject invalid fields, extra fields and a wrong updatedAt", async () => {
    await seed({ board: { farmActiveGameId: "open" }, games: { open: openGame() } });
    for (const field of ["wheat", "", null, 3, ["corn"], "Corn"]) {
      await assertFails(choose(bob(), "open", "bob", field));
    }
    await assertFails(choose(bob(), "open", "bob", "corn", { score: 8 }));
    await assertFails(setDoc(choiceRef(bob(), "open", "bob"), { field: "corn" }));
    await assertFails(setDoc(choiceRef(bob(), "open", "bob"), { field: "corn", updatedAt: seeded }));
  });

  it("should reject choices by non-members, the admin who is not a member, look-alikes and a late joiner", async () => {
    await seed({ board: { farmActiveGameId: "justStarted" }, games: { justStarted: justStartedGame() } });
    await assertFails(choose(stranger(), "justStarted", "stranger", "corn"));
    await assertFails(choose(admin(), "justStarted", "admin", "corn"));
    for (const make of Object.values(impostors)) await assertFails(choose(make(), "justStarted", "fake", "corn"));
    await assertFails(choose(dave(), "justStarted", "dave", "corn"));
  });

  it("should reject writing the choice of another member", async () => {
    await seed({ board: { farmActiveGameId: "open" }, games: { open: openGame() } });
    await assertFails(choose(bob(), "open", "carol", "corn"));
    await assertFails(choose(alice(), "open", "bob", "corn"));
  });

  it("should reject choices for a game that is not the active one, or is finished or cancelled", async () => {
    await seed({
      board: { farmActiveGameId: "open" },
      games: { open: openGame(), stale: openGame(), done: openGame({ status: "finished" }), cancelled: openGame({ status: "cancelled" }) },
    });
    await assertFails(choose(bob(), "stale", "bob", "corn"));
    await seed({ board: { farmActiveGameId: "done" }, games: { done: openGame({ status: "finished" }) } });
    await assertFails(choose(bob(), "done", "bob", "corn"));
    await seed({ board: { farmActiveGameId: "cancelled" }, games: { cancelled: openGame({ status: "cancelled" }) } });
    await assertFails(choose(bob(), "cancelled", "bob", "corn"));
    await seed({ board: { farmActiveGameId: "missing" }, games: {} });
    await assertFails(choose(bob(), "missing", "bob", "corn"));
  });

  it("should reject choices outside step 5 and on boards that are not in progress", async () => {
    await seed({ board: { farmActiveGameId: "open", phase: 4 }, games: { open: openGame() } });
    await assertFails(choose(bob(), "open", "bob", "corn"));
    await seed({ board: { farmActiveGameId: "open", status: "completed" }, games: { open: openGame() } });
    await assertFails(choose(bob(), "open", "bob", "corn"));
  });
});

describe("reading choices (D155)", () => {
  const withChoices = (games: Record<string, GameSeed>) =>
    seed({ board: { farmActiveGameId: Object.keys(games)[0] }, games, choices: { [Object.keys(games)[0]]: { alice: "corn", bob: "carrot" } } });

  it("should let a member read their own choice and nothing else before the deadline", async () => {
    await withChoices({ open: openGame() });
    await assertSucceeds(getDoc(choiceRef(bob(), "open", "bob")));
    await assertFails(getDoc(choiceRef(bob(), "open", "alice")));
    await assertFails(getDocs(collection(bob(), `boards/${BOARD}/farmGames/open/choices`)));
    await assertFails(getDocs(collection(admin(), `boards/${BOARD}/farmGames/open/choices`)));
    await assertFails(getDoc(choiceRef(admin(), "open", "bob")));
  });

  it("should reject reads by non-members and look-alikes before and after the deadline", async () => {
    await withChoices({ open: openGame() });
    await assertFails(getDoc(choiceRef(stranger(), "open", "bob")));
    for (const make of Object.values(impostors)) await assertFails(getDoc(choiceRef(make(), "open", "bob")));
    await withChoices({ closed: closedGame() });
    await assertFails(getDoc(choiceRef(stranger(), "closed", "bob")));
    await assertFails(getDocs(collection(stranger(), `boards/${BOARD}/farmGames/closed/choices`)));
    for (const make of Object.values(impostors)) {
      await assertFails(getDocs(collection(make(), `boards/${BOARD}/farmGames/closed/choices`)));
    }
  });

  it("should let members and the admin read every choice and list the collection after the deadline", async () => {
    await withChoices({ closed: closedGame() });
    for (const client of [alice(), bob(), carol(), admin()]) {
      await assertSucceeds(getDoc(choiceRef(client, "closed", "alice")));
      const listing = await assertSucceeds(getDocs(collection(client, `boards/${BOARD}/farmGames/closed/choices`)));
      expect(listing.size).toBe(2);
    }
  });

  it("should let members read the game document but not change it", async () => {
    await withChoices({ open: openGame() });
    await assertSucceeds(getDoc(gameRef(bob(), "open")));
    await assertFails(getDoc(gameRef(stranger(), "open")));
    await assertFails(updateDoc(gameRef(bob(), "open"), { status: "cancelled" }));
    await assertFails(deleteDoc(gameRef(admin(), "open")));
  });
});

describe("finishing a round (D156, D157, D158)", () => {
  const closedRound = () => seed({ board: { farmActiveGameId: "closed" }, games: { closed: closedGame() } });

  it("should let the admin finish with a direct winner without touching nextHostSpunAt", async () => {
    await closedRound();
    await assertSucceeds(finishRound(admin(), "closed", "bob", "direct"));
    const board = (await getDoc(boardRef(admin()))).data()!;
    expect(board.nextHostUid).toBe("bob");
    expect(board.nextHostGameId).toBe("closed");
    expect(board.nextHostSpunAt).toBeUndefined();
    const game = (await getDoc(gameRef(admin(), "closed"))).data()!;
    expect(game).toMatchObject({ status: "finished", resolution: "direct", winnerUid: "bob" });
    expect(game.resolvedAt).toBeDefined();
  });

  it("should let the admin finish with a tie wheel or an all wheel result that sets nextHostSpunAt", async () => {
    await closedRound();
    await assertSucceeds(finishRound(admin(), "closed", "carol", "tie-wheel"));
    expect((await getDoc(boardRef(admin()))).data()?.nextHostSpunAt).toBeDefined();
    await closedRound();
    await assertSucceeds(finishRound(admin(), "closed", "bob", "all-wheel"));
  });

  it("should reject finishing before the deadline", async () => {
    await seed({ board: { farmActiveGameId: "open" }, games: { open: openGame() } });
    await assertFails(finishRound(admin(), "open", "bob", "direct"));
  });

  it("should reject finishing by anyone but the admin", async () => {
    await closedRound();
    for (const client of [alice(), bob(), stranger(), ...Object.values(impostors).map((make) => make())]) {
      await assertFails(finishRound(client, "closed", "bob", "direct"));
    }
  });

  it("should reject a winner who is not a player: a stranger, a late joiner, an empty or non-string uid", async () => {
    await closedRound();
    await assertFails(finishRound(admin(), "closed", "stranger", "direct"));
    await assertFails(finishRound(admin(), "closed", "dave", "direct"));
    await assertFails(finishRound(admin(), "closed", "", "direct"));
    await assertFails(finishRound(admin(), "closed", 5 as unknown as string, "direct"));
  });

  it("should reject writing only the game or only the board", async () => {
    await closedRound();
    await assertFails(
      updateDoc(gameRef(admin(), "closed"), { status: "finished", resolution: "direct", winnerUid: "bob", resolvedAt: serverTimestamp() }),
    );
    await assertFails(
      updateDoc(boardRef(admin()), { nextHostUid: "bob", nextHostGameId: "closed", updatedAt: serverTimestamp() }),
    );
  });

  it("should reject a board winner that differs from the game winner", async () => {
    await closedRound();
    await assertFails(finishRound(admin(), "closed", "bob", "direct", { nextHostUid: "carol" }));
    await assertFails(finishRound(admin(), "closed", "bob", "direct", { nextHostGameId: "other" }));
  });

  it("should reject a direct result that updates nextHostSpunAt and a wheel result that does not or uses a client time", async () => {
    await closedRound();
    await assertFails(finishRound(admin(), "closed", "bob", "direct", { nextHostSpunAt: serverTimestamp() }));
    const db = admin();
    const wheelWithoutSpin = writeBatch(db);
    wheelWithoutSpin.update(gameRef(db, "closed"), { status: "finished", resolution: "tie-wheel", winnerUid: "bob", resolvedAt: serverTimestamp() });
    wheelWithoutSpin.update(boardRef(db), { nextHostUid: "bob", nextHostGameId: "closed", updatedAt: serverTimestamp() });
    await assertFails(wheelWithoutSpin.commit());
    await assertFails(finishRound(admin(), "closed", "bob", "tie-wheel", { nextHostSpunAt: Timestamp.now() }));
  });

  it("should reject an unknown resolution, extra game fields and a client resolvedAt", async () => {
    await closedRound();
    await assertFails(finishRound(admin(), "closed", "bob", "lucky"));
    await assertFails(finishRound(admin(), "closed", "bob", "direct", {}, { extra: 1 }));
    await assertFails(finishRound(admin(), "closed", "bob", "direct", {}, { resolvedAt: Timestamp.now() }));
  });

  it("should reject finishing twice and finishing a game that is not the active one", async () => {
    await closedRound();
    await assertSucceeds(finishRound(admin(), "closed", "bob", "direct"));
    await assertFails(finishRound(admin(), "closed", "carol", "direct"));

    await seed({ board: { farmActiveGameId: "other" }, games: { closed: closedGame(), other: openGame() } });
    await assertFails(finishRound(admin(), "closed", "bob", "direct"));
  });

  it("should reject finishing outside step 5", async () => {
    await seed({ board: { farmActiveGameId: "closed", phase: 6 }, games: { closed: closedGame() } });
    await assertFails(finishRound(admin(), "closed", "bob", "direct"));
  });
});

describe("cancelling and the fallback wheel (D156, D157, D158)", () => {
  it("should let the admin cancel the selecting game before or after its deadline, without a winner", async () => {
    await seed({ board: { farmActiveGameId: "open" }, games: { open: openGame() } });
    await assertSucceeds(cancelRound(admin(), "open"));
    const game = (await getDoc(gameRef(admin(), "open"))).data()!;
    expect(game.status).toBe("cancelled");
    expect(game.winnerUid).toBeUndefined();

    await seed({ board: { farmActiveGameId: "closed" }, games: { closed: closedGame() } });
    await assertSucceeds(cancelRound(admin(), "closed"));
  });

  it("should reject cancelling by anyone but the admin and cancelling with a winner or another field", async () => {
    await seed({ board: { farmActiveGameId: "open" }, games: { open: openGame() } });
    for (const client of [alice(), bob(), stranger(), ...Object.values(impostors).map((make) => make())]) {
      await assertFails(cancelRound(client, "open"));
    }
    await assertFails(cancelRound(admin(), "open", { winnerUid: "bob" }));
    await assertFails(cancelRound(admin(), "open", { resolution: "direct" }));
    await assertFails(cancelRound(admin(), "open", { resolvedAt: Timestamp.now() }));
  });

  it("should reject cancelling a finished or cancelled game and finishing a cancelled game", async () => {
    await seed({ board: { farmActiveGameId: "done", nextHostGameId: "done", nextHostUid: "bob" }, games: { done: finishedGame() } });
    await assertFails(cancelRound(admin(), "done"));

    await seed({ board: { farmActiveGameId: "cancelled" }, games: { cancelled: { ...cancelledGame(), startedAt: secondsFromNow(-60) } } });
    await assertFails(cancelRound(admin(), "cancelled"));
    await assertFails(finishRound(admin(), "cancelled", "bob", "direct"));
  });

  it("should reject cancelling outside step 5 and a game that is not the active one", async () => {
    await seed({ board: { farmActiveGameId: "open", phase: 3 }, games: { open: openGame() } });
    await assertFails(cancelRound(admin(), "open"));
    await seed({ board: { farmActiveGameId: "other" }, games: { open: openGame(), other: openGame() } });
    await assertFails(cancelRound(admin(), "open"));
  });

  it("should let the admin store the fallback wheel result of the cancelled active game exactly once", async () => {
    await seed({ board: { farmActiveGameId: "cancelled" }, games: { cancelled: cancelledGame() } });
    await assertSucceeds(storeFallback(admin(), "cancelled", "carol"));
    const board = (await getDoc(boardRef(admin()))).data()!;
    expect(board).toMatchObject({ nextHostUid: "carol", nextHostGameId: "cancelled" });
    expect(board.nextHostSpunAt).toBeDefined();
    await assertFails(storeFallback(admin(), "cancelled", "bob"));
    expect((await getDoc(boardRef(admin()))).data()?.nextHostUid).toBe("carol");
  });

  it("should reject a fallback result by anyone but the admin", async () => {
    await seed({ board: { farmActiveGameId: "cancelled" }, games: { cancelled: cancelledGame() } });
    for (const client of [alice(), bob(), stranger(), ...Object.values(impostors).map((make) => make())]) {
      await assertFails(storeFallback(client, "cancelled", "bob"));
    }
  });

  it("should reject a fallback result for a selecting or finished game, or one that is not the active game", async () => {
    await seed({ board: { farmActiveGameId: "open" }, games: { open: openGame() } });
    await assertFails(storeFallback(admin(), "open", "bob"));
    await seed({ board: { farmActiveGameId: "done", nextHostGameId: "done", nextHostUid: "bob" }, games: { done: finishedGame() } });
    await assertFails(storeFallback(admin(), "done", "carol"));
    await seed({ board: { farmActiveGameId: "newer" }, games: { cancelled: cancelledGame(), newer: openGame() } });
    await assertFails(storeFallback(admin(), "cancelled", "bob"));
  });

  it("should not let a stale cancelled game overwrite the result of a newer round", async () => {
    await seed({
      board: { farmActiveGameId: "newer", nextHostGameId: "newer", nextHostUid: "alice" },
      games: { cancelled: cancelledGame(), newer: finishedGame("alice") },
    });
    await assertFails(storeFallback(admin(), "cancelled", "bob"));
    expect((await getDoc(boardRef(admin()))).data()?.nextHostUid).toBe("alice");
  });

  it("should reject a fallback winner who is not a player, a client spin time and extra board fields", async () => {
    await seed({ board: { farmActiveGameId: "cancelled" }, games: { cancelled: cancelledGame() } });
    await assertFails(storeFallback(admin(), "cancelled", "stranger"));
    await assertFails(storeFallback(admin(), "cancelled", "dave"));
    await assertFails(storeFallback(admin(), "cancelled", "bob", { nextHostSpunAt: Timestamp.now() }));
    await assertFails(storeFallback(admin(), "cancelled", "bob", { phase: 1 }));
  });

  it("should reject a fallback result outside step 5", async () => {
    await seed({ board: { farmActiveGameId: "cancelled", phase: 4 }, games: { cancelled: cancelledGame() } });
    await assertFails(storeFallback(admin(), "cancelled", "bob"));
  });
});

describe("legacy next-host wheel (D150)", () => {
  it("should still accept the old spin on a board that never ran a farm round", async () => {
    await seed({});
    await assertSucceeds(
      updateDoc(boardRef(admin()), { nextHostUid: "bob", nextHostSpunAt: serverTimestamp(), updatedAt: serverTimestamp() }),
    );
  });

  it("should refuse the old spin once a farm round exists, so a repeated or stale game id cannot overwrite a result", async () => {
    await seed({ board: { farmActiveGameId: "open" }, games: { open: openGame() } });
    await assertFails(
      updateDoc(boardRef(admin()), { nextHostUid: "bob", nextHostSpunAt: serverTimestamp(), updatedAt: serverTimestamp() }),
    );
  });
});

describe("host eligibility (D163 to D166)", () => {
  // alice owns the board and therefore is the Host until a Host is handed over; carol is a past Host here.
  const closedRound = (board: Record<string, unknown> = {}) =>
    seed({ board: { farmActiveGameId: "closed", ...board }, games: { closed: closedGame() } });
  const cancelledRound = (board: Record<string, unknown> = {}) =>
    seed({ board: { farmActiveGameId: "cancelled", ...board }, games: { cancelled: cancelledGame() } });
  const handOver = (client: ReturnType<typeof admin>, data: Record<string, unknown>) =>
    updateDoc(boardRef(client), { updatedAt: serverTimestamp(), ...data });

  it("should reject the owner as next Host while nobody has been handed the role, for every resolution", async () => {
    await closedRound();
    for (const resolution of ["direct", "tie-wheel", "all-wheel"]) {
      await assertFails(finishRound(admin(), "closed", "alice", resolution));
    }
    await assertSucceeds(finishRound(admin(), "closed", "bob", "direct"));
  });

  it("should reject the stored current Host and every previous Host in every resolution, and accept an eligible winner", async () => {
    await closedRound({ hostUid: "bob", pastHostUids: ["alice", "carol"] });
    for (const resolution of ["direct", "tie-wheel", "all-wheel"]) {
      for (const excluded of ["bob", "alice", "carol"]) {
        await assertFails(finishRound(admin(), "closed", excluded, resolution));
      }
    }
    await closedRound({ hostUid: "bob", pastHostUids: ["alice"] });
    await assertSucceeds(finishRound(admin(), "closed", "carol", "tie-wheel"));
  });

  it("should reject a cancelled fallback result for the current or a previous Host and accept an eligible player", async () => {
    await cancelledRound({ hostUid: "bob", pastHostUids: ["alice"] });
    await assertFails(storeFallback(admin(), "cancelled", "bob"));
    await assertFails(storeFallback(admin(), "cancelled", "alice"));
    await assertSucceeds(storeFallback(admin(), "cancelled", "carol"));
  });

  it("should not treat a person who was only selected as next Host as a previous Host", async () => {
    // bob was stored as next Host (round "old") but never handed the role: a later round may select bob again.
    await seed({
      board: { farmActiveGameId: "closed", nextHostUid: "bob", nextHostGameId: "old" },
      games: { closed: closedGame() },
    });
    await assertSucceeds(finishRound(admin(), "closed", "bob", "direct"));
  });

  it("should reject a write that edits the Host lists together with a result", async () => {
    await closedRound();
    await assertFails(finishRound(admin(), "closed", "bob", "direct", { hostUid: "carol" }));
    await closedRound();
    await assertFails(finishRound(admin(), "closed", "bob", "direct", { pastHostUids: [] }));
  });

  it("should let the admin hand the Host role to the stored next Host and move the old Host to the past Hosts", async () => {
    await seed({ board: { farmActiveGameId: "done", nextHostGameId: "done", nextHostUid: "bob" }, games: { done: finishedGame("bob") } });
    await assertSucceeds(handOver(admin(), { hostUid: "bob", pastHostUids: ["alice"] }));
    expect((await getDoc(boardRef(admin()))).data()).toMatchObject({ hostUid: "bob", pastHostUids: ["alice"] });
    await seed({
      board: { farmActiveGameId: "done", nextHostGameId: "done", nextHostUid: "carol", hostUid: "bob", pastHostUids: ["alice"] },
      games: { done: finishedGame("carol") },
    });
    await assertSucceeds(handOver(admin(), { hostUid: "carol", pastHostUids: ["alice", "bob"] }));
  });

  it("should reject a hand-over that is not exactly the next Host plus the old Host appended once", async () => {
    await seed({ board: { farmActiveGameId: "done", nextHostGameId: "done", nextHostUid: "bob" }, games: { done: finishedGame("bob") } });
    await assertFails(handOver(admin(), { hostUid: "carol", pastHostUids: ["alice"] }));
    await assertFails(handOver(admin(), { hostUid: "bob", pastHostUids: [] }));
    await assertFails(handOver(admin(), { hostUid: "bob", pastHostUids: ["alice", "alice"] }));
    await assertFails(handOver(admin(), { hostUid: "bob", pastHostUids: ["carol"] }));
    await assertFails(handOver(admin(), { hostUid: "bob", pastHostUids: ["alice"], phase: 1 }));
    await assertFails(updateDoc(boardRef(admin()), { hostUid: "bob", pastHostUids: ["alice"], updatedAt: Timestamp.now() }));
    await assertFails(updateDoc(boardRef(admin()), { hostUid: "bob", updatedAt: serverTimestamp() }));
  });

  it("should reject a hand-over to the current Host, to a previous Host, or with no stored next Host", async () => {
    await seed({ board: { nextHostUid: "alice" } });
    await assertFails(handOver(admin(), { hostUid: "alice", pastHostUids: ["alice"] }));
    await seed({ board: { nextHostUid: "alice", hostUid: "bob", pastHostUids: ["alice"] } });
    await assertFails(handOver(admin(), { hostUid: "alice", pastHostUids: ["alice", "bob"] }));
    await seed({});
    await assertFails(handOver(admin(), { hostUid: "bob", pastHostUids: ["alice"] }));
  });

  it("should reject a hand-over while the active round has no stored result, outside step 5 and by anyone but the admin", async () => {
    await seed({ board: { farmActiveGameId: "open", nextHostGameId: "older", nextHostUid: "bob" }, games: { open: openGame() } });
    await assertFails(handOver(admin(), { hostUid: "bob", pastHostUids: ["alice"] }));
    await seed({ board: { nextHostUid: "bob", phase: 4 } });
    await assertFails(handOver(admin(), { hostUid: "bob", pastHostUids: ["alice"] }));
    await seed({ board: { nextHostUid: "bob" } });
    for (const client of [alice(), bob(), stranger(), ...Object.values(impostors).map((make) => make())]) {
      await assertFails(handOver(client, { hostUid: "bob", pastHostUids: ["alice"] }));
    }
  });

  it("should keep the legacy spin on a board that never ran a round, and refuse it once a round exists", async () => {
    await seed({ board: { hostUid: "bob", pastHostUids: ["alice"] } });
    await assertSucceeds(
      updateDoc(boardRef(admin()), { nextHostUid: "carol", nextHostSpunAt: serverTimestamp(), updatedAt: serverTimestamp() }),
    );
    await seed({ board: { farmActiveGameId: "done", nextHostGameId: "done", nextHostUid: "carol" }, games: { done: finishedGame("carol") } });
    await assertFails(
      updateDoc(boardRef(admin()), { nextHostUid: "bob", nextHostSpunAt: serverTimestamp(), updatedAt: serverTimestamp() }),
    );
  });
});
