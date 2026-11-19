import { randomInt } from "node:crypto";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, type Transaction } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { isChaosItemId, type ChaosItemId } from "../../lib/chaos/catalog";
import { CHAOS_ADMIN_EMAIL } from "../../lib/chaos/access";
import { closeChaosShopping, chaosEventWeights, createChaosGame, nextChaosTurn, purchaseChaosItem, resolveChaosEvent, selectFinalHost, setChaosEligibility, setFinalHostExclusions, spinChaosEvent, spinChaosPlayer, startChaosShopping, CHAOS_EVENTS, weightedChoice, type ChaosGameState } from "../../lib/chaos/state";
import { activateChaosItem, resolveChaosPendingAction, respondChaosProposal } from "../../lib/chaos/effects";

if (getApps().length === 0) initializeApp();
const db = getFirestore();

type Action = "create" | "setEligibility" | "startShopping" | "purchase" | "closeShopping"
  | "spinPlayer" | "spinEvent" | "activate" | "respondProposal" | "resolve" | "resolveAction" | "nextTurn" | "selectHost" | "confirmHost";
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
  eventCategory?: typeof CHAOS_EVENTS[number]["id"];
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

function validId(value: unknown, max = 128): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= max && !value.includes("/");
}
function isAdmin(token: Record<string, unknown>): boolean {
  return token.email_verified === true && typeof token.email === "string" && token.email.trim().toLowerCase() === CHAOS_ADMIN_EMAIL;
}
function requireAdmin(token: Record<string, unknown>): void {
  if (!isAdmin(token)) throw new HttpsError("permission-denied", "Verified admin required");
}
function requirePlayer(token: Record<string, unknown>, uid: string, game: ChaosGameState): void {
  if (isAdmin(token) || !game.players[uid]) throw new HttpsError("permission-denied", "Chaos admin cannot join as a player");
}
function secureFraction(): number { return randomInt(1_000_000_000) / 1_000_000_000; }
function sameMembers(values: unknown, allowed: string[]): string[] {
  if (!Array.isArray(values) || values.some((uid) => !validId(uid) || !allowed.includes(uid)) || new Set(values).size !== values.length) {
    throw new HttpsError("invalid-argument", "Invalid participant list");
  }
  return values as string[];
}
function gameResponse(game: StoredGame, privateResult?: unknown) {
  return { gameId: game.gameId, game, ...(privateResult === undefined ? {} : { privateResult }) };
}

export const chaosAction = onCall({ enforceAppCheck: false }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in required");
  const input = request.data as Input;
  if (!input || !validId(input.boardId) || !validId(input.requestId) || !validId(input.gameId ?? input.requestId) || typeof input.action !== "string") {
    throw new HttpsError("invalid-argument", "Invalid Chaos request");
  }
  const uid = request.auth.uid;
  const token = request.auth.token as Record<string, unknown>;
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
      if (!boardSnap.exists) throw new HttpsError("not-found", "Board missing");
      const board = boardSnap.data()!;
      if (board.status !== "in-progress" || board.phase !== 5) throw new HttpsError("failed-precondition", "Phase 5 is closed");
      if (prior.exists) {
        if (prior.data()!.uid !== uid || prior.data()!.action !== input.action) throw new HttpsError("already-exists", "Request ID was already used");
        return prior.data()!.response as ReturnType<typeof gameResponse>;
      }
      if (input.action === "create") {
        requireAdmin(token);
        if (gameSnap.exists || board.chaosActiveGameId) throw new HttpsError("already-exists", "Chaos game exists");
        const playerUids = input.playerUids;
        if (!Array.isArray(playerUids) || playerUids.length === 0 || new Set(playerUids).size !== playerUids.length || playerUids.some((value) => !validId(value)) || playerUids.includes(uid)) {
          throw new HttpsError("invalid-argument", "Select one or more unique players");
        }
        const currentHostUid = board.hostUid ?? board.ownerId;
        if (!playerUids.some((playerUid) => playerUid !== currentHostUid)) {
          throw new HttpsError("failed-precondition", "Select a player other than the current Host");
        }
        const members = await Promise.all(playerUids.map((playerUid) => tx.get(boardRef.collection("members").doc(playerUid))));
        if (members.some((member) => !member.exists)) throw new HttpsError("failed-precondition", "Selected player is not a board member");
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
      if (!gameSnap.exists || board.chaosActiveGameId !== gameId) throw new HttpsError("not-found", "Active Chaos game missing");
      const game = gameSnap.data() as StoredGame;
      const member = await tx.get(boardRef.collection("members").doc(uid));
      if (!member.exists && !isAdmin(token)) throw new HttpsError("permission-denied", "Board membership required");
      let next: StoredGame = { ...game, updatedAtMs: now };
      let privateResult: unknown;
      switch (input.action) {
        case "setEligibility": {
          requireAdmin(token);
          const canEditPlayers = game.phase === "setup" || game.phase === "final_host_selection" || game.phase === "chaos_rounds" && (game.turnPhase === "turn_complete" || game.turn === 1 && game.turnPhase === "ready");
          if (!canEditPlayers) {
            throw new HttpsError("failed-precondition", "Eligibility is locked");
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
          if (!isChaosItemId(input.itemId)) throw new HttpsError("invalid-argument", "Unknown item");
          if (!game.eligibleUids.includes(uid)) throw new HttpsError("permission-denied", "Player is not Chaos eligible");
          next = { ...next, ...purchaseChaosItem(game, uid, input.itemId) };
          break;
        case "closeShopping":
          if (game.phase !== "shopping") {
            if (game.phase === "setup") throw new HttpsError("failed-precondition", "Shopping is closed");
            next = game;
            break;
          }
          if (!isAdmin(token) && !(typeof game.shoppingEndsAtMs === "number" && now >= game.shoppingEndsAtMs)) {
            throw new HttpsError("permission-denied", "Only the admin can close shopping before the timer ends");
          }
          next = { ...next, ...closeChaosShopping(game) };
          break;
        case "spinPlayer":
          requireAdmin(token);
          if (game.phase !== "chaos_rounds" || game.turnPhase !== "ready") throw new HttpsError("failed-precondition", "Player wheel unavailable");
          next = { ...next, ...spinChaosPlayer(game, secureFraction()) };
          break;
        case "spinEvent":
          requireAdmin(token);
          if (game.phase !== "chaos_rounds" || (game.turnPhase !== "player_spin" && game.turnPhase !== "event_spin")) throw new HttpsError("failed-precondition", "Event wheel unavailable");
          {
            let guaranteedEventId: ChaosGameState["eventId"] = null;
            if (game.fortuneRequestId) {
              const secretRef = gameRef.collection("privateOutcomes").doc(game.fortuneRequestId);
              const secret = await tx.get(secretRef);
              const outcome = secret.data()?.fortuneEventId;
              if (!secret.exists || typeof outcome !== "string" || !CHAOS_EVENTS.some(event => event.id === outcome)) throw new HttpsError("failed-precondition", "Fortune result is missing");
              guaranteedEventId = outcome as NonNullable<ChaosGameState["eventId"]>;
              tx.delete(secretRef);
            }
            next = { ...next, ...spinChaosEvent(game, secureFraction(), guaranteedEventId ?? undefined), fortuneRequestId: null, reactionDeadlineMs: now + 5000 };
          }
          break;
        case "resolve": {
          requireAdmin(token);
          if (game.phase !== "chaos_rounds" || game.turnPhase !== "reaction_window" || !game.eventId || !game.selectedUid || now < (game.reactionDeadlineMs ?? 0)) {
            throw new HttpsError("failed-precondition", "Reaction window is open");
          }
          next = { ...next, ...resolveChaosEvent(game) };
          break;
        }
        case "resolveAction":
          requireAdmin(token);
          if (!game.pendingAction || now < (game.reactionDeadlineMs ?? 0)) throw new HttpsError("failed-precondition", "Item reaction window is open");
          next = { ...next, ...resolveChaosPendingAction(game) };
          break;
        case "nextTurn":
          requireAdmin(token);
          if (game.phase !== "chaos_rounds" || game.turnPhase !== "turn_complete") throw new HttpsError("failed-precondition", "Turn is incomplete");
          next = { ...next, ...nextChaosTurn(game) };
          break;
        case "selectHost": {
          requireAdmin(token);
          if (game.phase !== "final_host_selection" || game.selectedHostUid) throw new HttpsError("failed-precondition", "Host already selected");
          next = { ...next, ...selectFinalHost(game, game.hostUid, secureFraction()) };
          break;
        }
        case "confirmHost":
          requireAdmin(token);
          if (game.phase !== "final_host_selection" || !game.selectedHostUid || game.selectedHostUid === game.hostUid) {
            throw new HttpsError("failed-precondition", "No valid host selection");
          }
          if ((board.hostUid ?? board.ownerId) !== game.hostUid) throw new HttpsError("failed-precondition", "Board Host changed during Chaos game");
          if (!(await tx.get(boardRef.collection("members").doc(game.selectedHostUid))).exists) {
            throw new HttpsError("failed-precondition", "Selected Host is no longer a member");
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
          if (!game.eligibleUids.includes(uid)) throw new HttpsError("permission-denied", "Player is not Chaos eligible");
          if (!isChaosItemId(input.itemId)) throw new HttpsError("invalid-argument", "Unknown item");
          if ((game.turnPhase === "reaction_window" || game.pendingAction !== null) && now >= (game.reactionDeadlineMs ?? 0)) {
            throw new HttpsError("deadline-exceeded", "Reaction window closed");
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
          if (typeof input.accept !== "boolean") throw new HttpsError("invalid-argument", "Proposal response required");
          next = { ...next, ...respondChaosProposal(game, uid, input.accept) };
          break;
        default:
          throw new HttpsError("invalid-argument", "Unknown Chaos action");
      }
      tx.update(gameRef, next);
      const response = gameResponse(next, privateResult);
      tx.create(idempotencyRef, { uid, action: input.action, response, atMs: now });
      return response;
    });
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    if (error instanceof Error && /sold out|insufficient|limit|phase|item|window|target|candidate|curse|action|event|proposal|eligible|frozen|shield/i.test(error.message)) {
      throw new HttpsError("failed-precondition", error.message);
    }
    throw error;
  }
});
