import { randomInt } from "node:crypto";
import type { Transaction } from "firebase-admin/firestore";
import { getAdminFirestore } from "../firebase/server-admin";
import { isChaosItemId, type ChaosItemId } from "./catalog";
import { CHAOS_ADMIN_EMAIL } from "./access";
import { closeChaosShopping, chaosEventWeights, createChaosGame, nextChaosTurn, purchaseChaosItem, resolveChaosEvent, selectFinalHost, setChaosEligibility, setFinalHostExclusions, spinChaosEvent, spinChaosPlayer, startChaosShopping, CHAOS_EVENTS, weightedChoice, type ChaosGameState } from "./state";
import { activateChaosItem, resolveChaosPendingAction, respondChaosProposal } from "./effects";

type Action = "create" | "setEligibility" | "startShopping" | "purchase" | "closeShopping"
  | "spinPlayer" | "spinEvent" | "activate" | "respondProposal" | "resolve" | "resolveAction" | "nextTurn" | "selectHost" | "confirmHost";
type ChaosEventId = typeof CHAOS_EVENTS[number]["id"];
type Input = {
  action: Action;
  boardId: string;
  gameId?: string;
  requestId: string;
  playerUids?: string[];
  eligibleUids?: string[];
  finalExcludedUids?: string[];
  itemId?: ChaosItemId;
  targetUid?: string;
  targetItemId?: ChaosItemId;
  offeredItemId?: ChaosItemId;
  candidateUids?: string[];
  eventCategory?: ChaosEventId;
  accept?: boolean;
};
type StoredGame = ChaosGameState & {
  boardId: string;
  gameId: string;
  hostUid: string;
  createdAtMs: number;
  updatedAtMs: number;
  reactionDeadlineMs?: number;
};

type ChaosActionErrorCode = "unauthenticated" | "invalid-argument" | "permission-denied" | "not-found"
  | "failed-precondition" | "already-exists" | "deadline-exceeded";

export class ChaosActionError extends Error {
  constructor(readonly code: ChaosActionErrorCode, message: string) {
    super(message);
    this.name = "ChaosActionError";
  }
}

const ACTIONS: readonly Action[] = [
  "create", "setEligibility", "startShopping", "purchase", "closeShopping", "spinPlayer", "spinEvent",
  "activate", "respondProposal", "resolve", "resolveAction", "nextTurn", "selectHost", "confirmHost",
];

function validId(value: unknown, max = 128): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= max && !value.includes("/");
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isAction(value: unknown): value is Action {
  return typeof value === "string" && ACTIONS.some(action => action === value);
}
function isEventId(value: unknown): value is ChaosEventId {
  return CHAOS_EVENTS.some(event => event.id === value);
}
function parseIdArray(value: unknown, field: string): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    throw new ChaosActionError("invalid-argument", `Invalid ${field}`);
  }
  const ids = value.filter((id: unknown): id is string => validId(id));
  if (ids.length !== value.length) throw new ChaosActionError("invalid-argument", `Invalid ${field}`);
  return ids;
}
function parseInput(value: unknown): Input {
  if (!isRecord(value) || !validId(value.boardId) || !validId(value.requestId)) {
    throw new ChaosActionError("invalid-argument", "Invalid Chaos request");
  }
  if (typeof value.action !== "string") throw new ChaosActionError("invalid-argument", "Invalid Chaos request");
  if (!isAction(value.action)) throw new ChaosActionError("invalid-argument", "Unknown Chaos action");
  const optionalId = (field: string): string | undefined => {
    const item = value[field];
    if (item === undefined) return undefined;
    if (!validId(item)) throw new ChaosActionError("invalid-argument", `Invalid ${field}`);
    return item;
  };
  const optionalItemId = (field: string): ChaosItemId | undefined => {
    const item = value[field];
    if (item === undefined) return undefined;
    if (!isChaosItemId(item)) throw new ChaosActionError("invalid-argument", `Invalid ${field}`);
    return item;
  };
  const optionalBoolean = (field: string): boolean | undefined => {
    const item = value[field];
    if (item === undefined) return undefined;
    if (typeof item !== "boolean") throw new ChaosActionError("invalid-argument", `Invalid ${field}`);
    return item;
  };
  const eventCategory = value.eventCategory;
  if (eventCategory !== undefined && !isEventId(eventCategory)) {
    throw new ChaosActionError("invalid-argument", "Invalid eventCategory");
  }
  return {
    action: value.action,
    boardId: value.boardId,
    requestId: value.requestId,
    gameId: value.action === "create" && value.gameId === null ? undefined : optionalId("gameId"),
    playerUids: parseIdArray(value.playerUids, "playerUids"),
    eligibleUids: parseIdArray(value.eligibleUids, "eligibleUids"),
    finalExcludedUids: parseIdArray(value.finalExcludedUids, "finalExcludedUids"),
    itemId: optionalItemId("itemId"),
    targetUid: optionalId("targetUid"),
    targetItemId: optionalItemId("targetItemId"),
    offeredItemId: optionalItemId("offeredItemId"),
    candidateUids: parseIdArray(value.candidateUids, "candidateUids"),
    eventCategory,
    accept: optionalBoolean("accept"),
  };
}
function isAdmin(token: { email?: string; email_verified?: boolean }): boolean {
  return token.email_verified === true && typeof token.email === "string" && token.email.trim().toLowerCase() === CHAOS_ADMIN_EMAIL;
}
function requireAdmin(token: { email?: string; email_verified?: boolean }): void {
  if (!isAdmin(token)) throw new ChaosActionError("permission-denied", "Verified admin required");
}
function requirePlayer(token: { email?: string; email_verified?: boolean }, uid: string, game: ChaosGameState): void {
  if (isAdmin(token) || !game.players[uid]) throw new ChaosActionError("permission-denied", "Chaos admin cannot join as a player");
}
function secureFraction(): number { return randomInt(1_000_000_000) / 1_000_000_000; }
function sameMembers(values: unknown, allowed: string[]): string[] {
  if (!Array.isArray(values)) throw new ChaosActionError("invalid-argument", "Invalid participant list");
  const members = values.filter((uid: unknown): uid is string => validId(uid));
  if (members.length !== values.length || members.some(uid => !allowed.includes(uid)) || new Set(members).size !== members.length) {
    throw new ChaosActionError("invalid-argument", "Invalid participant list");
  }
  return members;
}
function gameResponse(game: StoredGame, privateResult?: unknown) {
  return { gameId: game.gameId, game, ...(privateResult === undefined ? {} : { privateResult }) };
}

export async function performChaosAction(
  data: unknown,
  uid: string,
  token: { email?: string; email_verified?: boolean },
) {
  const input = parseInput(data);
  if (input.action !== "create" && !validId(input.gameId)) {
    throw new ChaosActionError("invalid-argument", "Invalid Chaos request");
  }
  const db = getAdminFirestore();
  const boardRef = db.doc(`boards/${input.boardId}`);
  const gameId = input.action === "create" ? input.requestId : input.gameId!;
  const gameRef = boardRef.collection("chaosGames").doc(gameId);
  const idempotencyRef = gameRef.collection("requests").doc(input.requestId);
  const now = Date.now();

  try {
    return await db.runTransaction(async (tx: Transaction) => {
      const [boardSnap, gameSnap, prior] = await Promise.all([
        tx.get(boardRef), tx.get(gameRef), tx.get(idempotencyRef),
      ]);
      if (!boardSnap.exists) throw new ChaosActionError("not-found", "Board missing");
      const board = boardSnap.data()!;
      if (board.status !== "in-progress" || board.phase !== 5) throw new ChaosActionError("failed-precondition", "Phase 5 is closed");
      if (prior.exists) {
        if (prior.data()!.uid !== uid || prior.data()!.action !== input.action) throw new ChaosActionError("already-exists", "Request ID was already used");
        return prior.data()!.response as ReturnType<typeof gameResponse>;
      }
      if (input.action === "create") {
        requireAdmin(token);
        if (gameSnap.exists || board.chaosActiveGameId) throw new ChaosActionError("already-exists", "Chaos game exists");
        const playerUids = input.playerUids;
        if (!Array.isArray(playerUids) || playerUids.length === 0 || new Set(playerUids).size !== playerUids.length || playerUids.some((value) => !validId(value)) || playerUids.includes(uid)) {
          throw new ChaosActionError("invalid-argument", "Select one or more unique players");
        }
        const currentHostUid = board.hostUid ?? board.ownerId;
        if (!playerUids.some((playerUid) => playerUid !== currentHostUid)) {
          throw new ChaosActionError("failed-precondition", "Select a player other than the current Host");
        }
        const members = await Promise.all(playerUids.map((playerUid) => tx.get(boardRef.collection("members").doc(playerUid))));
        if (members.some((member) => !member.exists)) throw new ChaosActionError("failed-precondition", "Selected player is not a board member");
        const state = createChaosGame(playerUids);
        const game: StoredGame = {
          ...state, boardId: input.boardId, gameId,
          hostUid: currentHostUid, createdAtMs: now, updatedAtMs: now,
        };
        tx.create(gameRef, game);
        tx.update(boardRef, { chaosActiveGameId: gameId });
        const response = gameResponse(game);
        tx.create(idempotencyRef, { uid, action: input.action, response, atMs: now });
        return response;
      }
      if (!gameSnap.exists || board.chaosActiveGameId !== gameId) throw new ChaosActionError("not-found", "Active Chaos game missing");
      const game = gameSnap.data() as StoredGame;
      const member = await tx.get(boardRef.collection("members").doc(uid));
      if (!member.exists && !isAdmin(token)) throw new ChaosActionError("permission-denied", "Board membership required");
      let next: StoredGame = { ...game, updatedAtMs: now };
      let privateResult: unknown;
      switch (input.action) {
        case "setEligibility": {
          requireAdmin(token);
          const canEditPlayers = game.phase === "setup" || game.phase === "final_host_selection" || game.phase === "chaos_rounds" && (game.turnPhase === "turn_complete" || game.turn === 1 && game.turnPhase === "ready");
          if (!canEditPlayers) {
            throw new ChaosActionError("failed-precondition", "Eligibility is locked");
          }
          const players = Object.keys(game.players);
          const exclusions = sameMembers(input.finalExcludedUids, players);
          next = game.phase === "final_host_selection"
            ? { ...next, ...setFinalHostExclusions(game, exclusions, game.hostUid) }
            : { ...next, ...setChaosEligibility(game, sameMembers(input.eligibleUids, players)), finalHostExcludedUids: exclusions };
          next.history = [...next.history, `eligibility:${uid}:${now}`];
          break;
        }
        case "startShopping":
          requireAdmin(token);
          next = { ...next, ...startChaosShopping(game, now) };
          break;
        case "purchase":
          if (game.phase === "shopping" && typeof game.shoppingEndsAtMs === "number" && now >= game.shoppingEndsAtMs) {
            next = { ...next, ...closeChaosShopping(game) };
            break;
          }
          requirePlayer(token, uid, game);
          if (!isChaosItemId(input.itemId)) throw new ChaosActionError("invalid-argument", "Unknown item");
          if (!game.eligibleUids.includes(uid)) throw new ChaosActionError("permission-denied", "Player is not Chaos eligible");
          next = { ...next, ...purchaseChaosItem(game, uid, input.itemId) };
          break;
        case "closeShopping":
          if (game.phase !== "shopping") {
            if (game.phase === "setup") throw new ChaosActionError("failed-precondition", "Shopping is closed");
            next = game;
            break;
          }
          if (!isAdmin(token) && !(typeof game.shoppingEndsAtMs === "number" && now >= game.shoppingEndsAtMs)) {
            throw new ChaosActionError("permission-denied", "Only the admin can close shopping before the timer ends");
          }
          next = { ...next, ...closeChaosShopping(game) };
          break;
        case "spinPlayer":
          requireAdmin(token);
          if (game.phase !== "chaos_rounds" || game.turnPhase !== "ready") throw new ChaosActionError("failed-precondition", "Player wheel unavailable");
          next = { ...next, ...spinChaosPlayer(game, secureFraction()) };
          break;
        case "spinEvent":
          requireAdmin(token);
          if (game.phase !== "chaos_rounds" || (game.turnPhase !== "player_spin" && game.turnPhase !== "event_spin")) throw new ChaosActionError("failed-precondition", "Event wheel unavailable");
          {
            let guaranteedEventId: ChaosGameState["eventId"] = null;
            if (game.fortuneRequestId) {
              const secretRef = gameRef.collection("privateOutcomes").doc(game.fortuneRequestId);
              const secret = await tx.get(secretRef);
              const outcome = secret.data()?.fortuneEventId;
              if (!secret.exists || typeof outcome !== "string" || !CHAOS_EVENTS.some(event => event.id === outcome)) throw new ChaosActionError("failed-precondition", "Fortune result is missing");
              guaranteedEventId = outcome as NonNullable<ChaosGameState["eventId"]>;
              tx.delete(secretRef);
            }
            next = { ...next, ...spinChaosEvent(game, secureFraction(), guaranteedEventId ?? undefined), fortuneRequestId: null, reactionDeadlineMs: now + 5000 };
          }
          break;
        case "resolve": {
          requireAdmin(token);
          if (game.phase !== "chaos_rounds" || game.turnPhase !== "reaction_window" || !game.eventId || !game.selectedUid || now < (game.reactionDeadlineMs ?? 0)) {
            throw new ChaosActionError("failed-precondition", "Reaction window is open");
          }
          next = { ...next, ...resolveChaosEvent(game) };
          break;
        }
        case "resolveAction":
          requireAdmin(token);
          if (!game.pendingAction || now < (game.reactionDeadlineMs ?? 0)) throw new ChaosActionError("failed-precondition", "Item reaction window is open");
          next = { ...next, ...resolveChaosPendingAction(game) };
          break;
        case "nextTurn":
          requireAdmin(token);
          if (game.phase !== "chaos_rounds" || game.turnPhase !== "turn_complete") throw new ChaosActionError("failed-precondition", "Turn is incomplete");
          next = { ...next, ...nextChaosTurn(game) };
          break;
        case "selectHost": {
          requireAdmin(token);
          if (game.phase !== "final_host_selection" || game.selectedHostUid) throw new ChaosActionError("failed-precondition", "Host already selected");
          next = { ...next, ...selectFinalHost(game, game.hostUid, secureFraction()) };
          break;
        }
        case "confirmHost":
          requireAdmin(token);
          if (game.phase !== "final_host_selection" || !game.selectedHostUid || game.selectedHostUid === game.hostUid) {
            throw new ChaosActionError("failed-precondition", "No valid host selection");
          }
          if ((board.hostUid ?? board.ownerId) !== game.hostUid) throw new ChaosActionError("failed-precondition", "Board Host changed during Chaos game");
          if (!(await tx.get(boardRef.collection("members").doc(game.selectedHostUid))).exists) {
            throw new ChaosActionError("failed-precondition", "Selected Host is no longer a member");
          }
          next = { ...next, phase: "finished" };
          tx.update(boardRef, {
            nextHostUid: game.selectedHostUid,
            nextHostGameId: gameId,
            nextHostSpunAt: new Date(now),
            updatedAt: new Date(now),
          });
          break;
        case "activate": {
          if (game.phase === "shopping" && typeof game.shoppingEndsAtMs === "number" && now >= game.shoppingEndsAtMs) {
            next = { ...next, ...closeChaosShopping(game) };
            break;
          }
          requirePlayer(token, uid, game);
          if (!game.eligibleUids.includes(uid)) throw new ChaosActionError("permission-denied", "Player is not Chaos eligible");
          if (!isChaosItemId(input.itemId)) throw new ChaosActionError("invalid-argument", "Unknown item");
          if ((game.turnPhase === "reaction_window" || game.pendingAction !== null) && now >= (game.reactionDeadlineMs ?? 0)) {
            throw new ChaosActionError("deadline-exceeded", "Reaction window closed");
          }
          if (input.candidateUids) sameMembers(input.candidateUids, game.eligibleUids);
          const fortuneEvents = game.bonusSpinActive ? CHAOS_EVENTS.filter(event => event.id !== "double-trouble") : CHAOS_EVENTS;
          const preselected = weightedChoice(fortuneEvents.map(event => event.id), chaosEventWeights(game, fortuneEvents), secureFraction());
          const effect = activateChaosItem(game, uid, input.itemId, {
            targetUid: input.targetUid,
            targetItemId: input.targetItemId,
            offeredItemId: input.offeredItemId,
            candidateUids: input.candidateUids,
            eventCategory: input.eventCategory,
            predeterminedEventId: preselected,
          }, secureFraction());
          next = { ...next, ...effect.state };
          if (effect.state.pendingAction !== game.pendingAction) next.reactionDeadlineMs = now + 5000;
          privateResult = effect.privateResult;
          if (privateResult !== undefined) {
            tx.create(gameRef.collection("privateResults").doc(input.requestId), { uid, result: privateResult, createdAtMs: now });
          }
          if (effect.serverOnly?.fortuneEventId) {
            tx.create(gameRef.collection("privateOutcomes").doc(input.requestId), { uid, fortuneEventId: effect.serverOnly.fortuneEventId, createdAtMs: now });
            next.fortuneRequestId = input.requestId;
          }
          break;
        }
        case "respondProposal":
          requirePlayer(token, uid, game);
          if (typeof input.accept !== "boolean") throw new ChaosActionError("invalid-argument", "Proposal response required");
          next = { ...next, ...respondChaosProposal(game, uid, input.accept) };
          break;
        default:
          throw new ChaosActionError("invalid-argument", "Unknown Chaos action");
      }
      tx.update(gameRef, next);
      const response = gameResponse(next, privateResult);
      tx.create(idempotencyRef, { uid, action: input.action, response, atMs: now });
      return response;
    });
  } catch (error) {
    if (error instanceof ChaosActionError) throw error;
    if (error instanceof Error && /sold out|insufficient|limit|phase|item|window|target|candidate|curse|action|event|proposal|eligible|frozen|shield/i.test(error.message)) {
      throw new ChaosActionError("failed-precondition", error.message);
    }
    throw error;
  }
}
