import { connectFunctionsEmulator, getFunctions, httpsCallable, type Functions } from "firebase/functions";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CHAOS_ADMIN_EMAIL } from "@/lib/chaos/access";
import { createBoard, joinBoard, setPhase, startSession } from "@/lib/firebase/boards";
import { createTestUser, resetEmulators, type TestUser } from "./helpers";

type ChaosRequest = { boardId: string; requestId: string; action: string; gameId?: string; [key: string]: unknown };
type ChaosResponse = { gameId: string; game: { players: Record<string, { eris: number }>; itemOwners: Record<string, string>; eligibleUids?: string[]; selectedUid?: string | null; eventId?: string | null }; privateResult?: unknown };

let admin: TestUser;
let players: TestUser[];
let boardId: string;
let gameId: string;
const connectedFunctions = new WeakSet<Functions>();

async function call(user: TestUser, input: ChaosRequest): Promise<ChaosResponse> {
  const functions = getFunctions(user.app);
  if (!connectedFunctions.has(functions)) {
    connectFunctionsEmulator(functions, "127.0.0.1", 5001);
    connectedFunctions.add(functions);
  }
  return (await httpsCallable<ChaosRequest, ChaosResponse>(functions, "chaosAction")(input)).data;
}

beforeAll(async () => {
  await resetEmulators();
  admin = await createTestUser("chaos-admin", "ผู้ดูแล", { email: CHAOS_ADMIN_EMAIL });
  players = [];
  for (let index = 1; index <= 7; index++) players.push(await createTestUser(`chaos-player-${index}`, `ผู้เล่น ${index}`));
  boardId = await createBoard(admin.user, "Chaos test", "ผู้ดูแล", admin.db);
  for (const player of players) await joinBoard(boardId, player.user, player.name, player.db);
  await startSession(boardId, admin.db);
  await setPhase(boardId, 5, admin.db);
}, 60_000);

afterAll(async () => resetEmulators());

describe("trusted Wheel of Chaos Functions", () => {
  it("supports a flexible roster and settles a competing global-stock purchase atomically", async () => {
    await expect(call(admin, { action: "create", boardId, requestId: crypto.randomUUID(), playerUids: [admin.uid, ...players.slice(0, 6).map(player => player.uid)] })).rejects.toMatchObject({ code: "functions/invalid-argument" });
    const created = await call(admin, { action: "create", boardId, requestId: crypto.randomUUID(), playerUids: players.slice(0, 3).map(player => player.uid) });
    gameId = created.gameId;
    expect(Object.keys(created.game.players)).toHaveLength(3);
    expect(created.game.players).not.toHaveProperty(admin.uid);
    await call(admin, { action: "startShopping", boardId, gameId, requestId: crypto.randomUUID() });
    const initial = await getDoc(doc(admin.db, `boards/${boardId}/chaosGames/${gameId}`));
    const initialGame = initial.data() as { players: Record<string, { eris: number }> };
    expect(Object.values(initialGame.players).map(player => player.eris)).toEqual([100, 100, 100]);
    await expect(call(admin, { action: "purchase", boardId, gameId, requestId: crypto.randomUUID(), itemId: "holy-shield" })).rejects.toMatchObject({ code: "functions/permission-denied" });
    const race = await Promise.allSettled([players[1], players[2]].map(player =>
      call(player, { action: "purchase", boardId, gameId, requestId: crypto.randomUUID(), itemId: "holy-shield" }),
    ));
    expect(race.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(race.filter(result => result.status === "rejected")).toHaveLength(1);

    const afterPurchase = await getDoc(doc(admin.db, `boards/${boardId}/chaosGames/${gameId}`));
    const game = afterPurchase.data() as { players: Record<string, { eris: number; items: string[] }>; itemOwners: Record<string, string> };
    expect(Object.values(game.itemOwners)).toHaveLength(1);
    expect(Object.values(game.players).every(player => player.eris === 100 || player.eris === 80)).toBe(true);
    expect(Object.values(game.players).filter(player => player.items.includes("holy-shield"))).toHaveLength(1);

    const ownerUid = game.itemOwners["holy-shield"];
    const charged = game.players[ownerUid];
    expect(charged.eris).toBe(80);

    await call(players[0], { action: "purchase", boardId, gameId, requestId: crypto.randomUUID(), itemId: "eris-thief" });
    await call(players[0], { action: "activate", boardId, gameId, requestId: crypto.randomUUID(), itemId: "eris-thief", targetUid: players[2].uid });
    const afterItemUse = await getDoc(doc(admin.db, `boards/${boardId}/chaosGames/${gameId}`));
    expect((afterItemUse.data() as { history: string[] }).history.at(-1)).toBe(`item:${players[0].uid}:eris-thief:${players[2].uid}`);

    await expect(updateDoc(doc(admin.db, `boards/${boardId}/chaosGames/${gameId}`), { players: {} })).rejects.toThrow();
  }, 30_000);

  it("keeps a Fortune Cookie outcome server-only and rejects non-Admin spins", async () => {
    const nonAdmin = players[1];
    await expect(call(nonAdmin, { action: "closeShopping", boardId, gameId, requestId: crypto.randomUUID() })).rejects.toMatchObject({ code: "functions/permission-denied" });

    const cookieBuyer = players[2];
    await call(cookieBuyer, { action: "purchase", boardId, gameId, requestId: crypto.randomUUID(), itemId: "fortune-cookie" });
    await call(admin, { action: "closeShopping", boardId, gameId, requestId: crypto.randomUUID() });
    const roundOneCandidates = [players[1].uid, players[2].uid];
    const eligibility = await call(admin, { action: "setEligibility", boardId, gameId, requestId: crypto.randomUUID(), eligibleUids: roundOneCandidates, finalExcludedUids: [] });
    expect(eligibility.game.eligibleUids).toEqual(roundOneCandidates);
    const playerSpin = await call(admin, { action: "spinPlayer", boardId, gameId, requestId: crypto.randomUUID() });
    expect(roundOneCandidates).toContain(playerSpin.game.selectedUid);
    const requestId = crypto.randomUUID();
    const hint = await call(cookieBuyer, { action: "activate", boardId, gameId, requestId, itemId: "fortune-cookie" });
    expect(Array.isArray(hint.privateResult)).toBe(true);
    expect((hint.privateResult as unknown[]).length).toBe(2);
    await expect(getDoc(doc(cookieBuyer.db, `boards/${boardId}/chaosGames/${gameId}/privateOutcomes/${requestId}`))).rejects.toThrow();
    const event = await call(admin, { action: "spinEvent", boardId, gameId, requestId: crypto.randomUUID() });
    expect((hint.privateResult as string[])).toContain(event.game.eventId);
  }, 30_000);
});
