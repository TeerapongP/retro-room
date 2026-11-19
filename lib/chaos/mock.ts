import { getMockBackend } from "@/lib/mock";
import type { ChaosItemId } from "./catalog";
import { activateChaosItem, resolveChaosPendingAction, respondChaosProposal } from "./effects";
import {
  closeChaosShopping, createChaosGame, nextChaosTurn, purchaseChaosItem,
  resolveChaosEvent, selectFinalHost, setChaosEligibility, spinChaosEvent, spinChaosPlayer,
  startChaosShopping, chaosEventWeights, CHAOS_EVENTS, weightedChoice, type ChaosEventId, type ChaosGameState,
} from "./state";

type MockGame = ChaosGameState & { gameId: string; boardId: string; hostUid: string; mockFortuneEventId?: ChaosEventId | null };
type Stored = { game: MockGame; requests: string[] };
const listeners = new Map<string, Set<(game: ChaosGameState | null) => void>>();
const cache = new Map<string, Stored>();

function key(boardId: string, gameId: string) { return `retroRoomChaos:${boardId}:${gameId}`; }
function mockRandom(payload: Record<string, unknown>, requestCount: number, salt = 0): number {
  const requested = payload.testRandom;
  if (typeof requested === "number" && requested >= 0 && requested < 1) return requested;
  return ((requestCount * 37 + salt * 17) % 100) / 100;
}
function read(boardId: string, gameId: string): Stored | null {
  const id = key(boardId, gameId);
  if (cache.has(id)) return cache.get(id)!;
  try {
    const raw = localStorage.getItem(id);
    if (!raw) return null;
    const value = JSON.parse(raw) as Stored;
    cache.set(id, value);
    return value;
  } catch { return null; }
}
function save(record: Stored) {
  const id = key(record.game.boardId, record.game.gameId);
  cache.set(id, record);
  localStorage.setItem(id, JSON.stringify(record));
  for (const listener of listeners.get(id) ?? []) listener(record.game);
}

export function subscribeMockChaosGame(boardId: string, gameId: string, onGame: (game: ChaosGameState | null) => void): () => void {
  const id = key(boardId, gameId);
  const set = listeners.get(id) ?? new Set();
  set.add(onGame);
  listeners.set(id, set);
  queueMicrotask(() => onGame(read(boardId, gameId)?.game ?? null));
  return () => { set.delete(onGame); if (set.size === 0) listeners.delete(id); };
}

export async function runMockChaosAction(
  boardId: string, requestId: string, action: string, payload: Record<string, unknown>,
): Promise<{ gameId: string; game: ChaosGameState; privateResult?: unknown }> {
  const backend = getMockBackend();
  const uid = backend.getCurrentUser()?.uid;
  if (!uid) throw new Error("Sign in required");
  const board = backend.getChaosBoard(boardId);
  if (board.phase !== 5 || board.status !== "in-progress") throw new Error("Phase 5 is closed");
  const admin = uid === "mock-admin";
  const actorUid = admin && typeof payload.mockPlayerUid === "string" ? payload.mockPlayerUid : uid;
  if (action === "create") {
    if (!admin) throw new Error("Admin required");
    const playerUids = payload.playerUids as string[];
    if (!Array.isArray(playerUids) || playerUids.includes(uid)) throw new Error("Admin cannot join as a player");
    const currentHostUid = board.hostUid ?? board.ownerId;
    if (!playerUids.some(playerUid => playerUid !== currentHostUid)) throw new Error("Select a player other than the current Host");
    const gameId = requestId;
    const existing = read(boardId, gameId);
    if (existing) return { gameId, game: existing.game };
    if (board.chaosActiveGameId) throw new Error("A Chaos game is already active");
    const game: MockGame = { ...createChaosGame(playerUids), boardId, gameId, hostUid: currentHostUid };
    save({ game, requests: [requestId] });
    backend.setChaosActiveGameId(boardId, gameId);
    return { gameId, game };
  }
  const gameId = payload.gameId as string;
  const stored = read(boardId, gameId);
  if (!stored || board.chaosActiveGameId !== gameId) throw new Error("Active Chaos game not found");
  if (stored.requests.includes(requestId)) return { gameId, game: stored.game };
  let game = stored.game;
  let privateResult: unknown;
  const requireAdmin = () => { if (!admin) throw new Error("Admin required"); };
  const requirePlayer = () => { if (!game.players[actorUid] || (!admin && actorUid !== uid)) throw new Error("Chaos admin cannot join as a player"); };
  switch (action) {
    case "setEligibility":
      requireAdmin();
      if (!Array.isArray(payload.finalExcludedUids) || new Set(payload.finalExcludedUids).size !== payload.finalExcludedUids.length || payload.finalExcludedUids.some(value => typeof value !== "string" || !(value in game.players))) throw new Error("Invalid host exclusions");
      game = game.phase === "final_host_selection"
        ? { ...game, finalHostExcludedUids: payload.finalExcludedUids as string[] }
        : { ...game, ...setChaosEligibility(game, payload.eligibleUids as string[]), finalHostExcludedUids: payload.finalExcludedUids as string[] };
      break;
    case "startShopping": requireAdmin(); game = { ...game, ...startChaosShopping(game, Date.now()) }; break;
    case "purchase":
      if (game.phase === "shopping" && typeof game.shoppingEndsAtMs === "number" && Date.now() >= game.shoppingEndsAtMs) {
        game = { ...game, ...closeChaosShopping(game) };
        break;
      }
      requirePlayer();
      game = { ...game, ...purchaseChaosItem(game, actorUid, payload.itemId as ChaosItemId) };
      break;
    case "closeShopping":
      if (game.phase !== "shopping") {
        if (game.phase === "setup") requireAdmin();
        break;
      }
      if (!admin && !(typeof game.shoppingEndsAtMs === "number" && Date.now() >= game.shoppingEndsAtMs)) throw new Error("Admin required until shopping ends");
      game = { ...game, ...closeChaosShopping(game) };
      break;
    case "spinPlayer": requireAdmin(); game = { ...game, ...spinChaosPlayer(game, mockRandom(payload, stored.requests.length)) }; break;
    case "spinEvent":
      requireAdmin();
      game = { ...game, ...spinChaosEvent(game, mockRandom(payload, stored.requests.length), stored.game.mockFortuneEventId ?? undefined), mockFortuneEventId: null };
      break;
    case "resolve": requireAdmin(); game = { ...game, ...resolveChaosEvent(game) }; break;
    case "resolveAction": requireAdmin(); game = { ...game, ...resolveChaosPendingAction(game) }; break;
    case "respondProposal": requirePlayer(); game = { ...game, ...respondChaosProposal(game, actorUid, payload.accept === true) }; break;
    case "nextTurn": requireAdmin(); game = { ...game, ...nextChaosTurn(game) }; break;
    case "activate": {
      if (game.phase === "shopping" && typeof game.shoppingEndsAtMs === "number" && Date.now() >= game.shoppingEndsAtMs) {
        game = { ...game, ...closeChaosShopping(game) };
        break;
      }
      requirePlayer();
      const availableEvents = game.bonusSpinActive ? CHAOS_EVENTS.filter(event => event.id !== "double-trouble") : CHAOS_EVENTS;
      const predeterminedEventId = weightedChoice(availableEvents.map(event => event.id), chaosEventWeights(game, availableEvents), mockRandom(payload, stored.requests.length));
      const result = activateChaosItem(game, actorUid, payload.itemId as ChaosItemId, {
        targetUid: payload.targetUid as string | undefined,
        targetItemId: payload.targetItemId as ChaosItemId | undefined,
        offeredItemId: payload.offeredItemId as ChaosItemId | undefined,
        candidateUids: payload.candidateUids as string[] | undefined,
        eventCategory: payload.eventCategory as ChaosEventId | undefined,
        predeterminedEventId,
      }, mockRandom(payload, stored.requests.length, 1));
      game = { ...game, ...result.state };
      if (result.serverOnly?.fortuneEventId) game.mockFortuneEventId = result.serverOnly.fortuneEventId;
      privateResult = result.privateResult;
      break;
    }
    case "selectHost": {
      requireAdmin();
      game = { ...game, ...selectFinalHost(game, stored.game.hostUid, mockRandom(payload, stored.requests.length)) };
      break;
    }
    case "confirmHost":
      requireAdmin();
      if (game.phase !== "final_host_selection" || !game.selectedHostUid) throw new Error("No host selected");
      backend.confirmChaosHost(boardId, game.selectedHostUid);
      game = { ...game, phase: "finished" };
      break;
    default: throw new Error(`Unsupported Chaos action: ${action}`);
  }
  save({ game, requests: [...stored.requests, requestId] });
  return { gameId, game, privateResult };
}
