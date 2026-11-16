import {
  Timestamp,
  collection,
  doc,
  increment,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
  type DocumentData,
  type Firestore,
  type Unsubscribe,
} from "firebase/firestore";
import {
  FarmError,
  excludedHostUids,
  isFarmFieldId,
  type FarmChoice,
  type FarmFieldId,
  type FarmGame,
  type FarmGameStatus,
  type FarmResolution,
} from "../crowded-farm";
import { getMockBackend, isMockMode } from "../mock";
import { getFirebaseFirestore } from "./client";
import type {
  AchievementResult,
  AttackDocument,
  AttackStatus,
  BattleFeedEvent,
  BattleFeedEventType,
  BattleItemType,
  ChestType,
  FishCatch,
  FishingGame,
  FishingGameStatus,
  InventorySlot,
  InventoryState,
  PowerAction,
  PowerActionType,
  PowerPoints,
  Reaction,
  ReactionType,
  ResolvedState,
  TreasureChest,
  TreasureGame,
  TreasureGameStatus,
  TreasureModifier,
  TreasurePlayerState,
  TreasurePowerAction,
  TreasurePowerActionType,
  TreasureResolvedState,
  WheelSegment,
} from "./types";
import {
  ATTACK_WARNING_MS,
  BATTLE_ITEM_COSTS,
  BOMB_GIFT_DAMAGE,
  FINAL_RUSH_ATTACK_SHUTDOWN_MS,
  GOLDEN_PICK_BONUS,
  ICE_TRAP_DURATION_MS,
  MAX_RESPINS,
  POWER_ACTION_COSTS,
  RECOVERY_POTION_RESTORE,
  SNEAKY_THIEF_MAX_STEAL,
  TREASURE_MAX_RESPINS,
  TREASURE_POWER_ACTION_COSTS,
} from "./types";

/**
 * Crowded Farm services (F30). Starting, finishing, cancelling and storing a fallback result are transactions:
 * they read the documents the rule depends on, check them again on every retry and write only when still valid.
 * A transaction function can run more than once, so it creates no ids, picks no winners and touches no UI. The
 * caller prepares gameId, winnerUid and resolution once, before the call. Firestore Rules still check the same
 * invariants when the writes are committed.
 */

const TRANSACTION_OPTIONS = { maxAttempts: 5 };

function toDate(value: unknown): Date | null {
  return value instanceof Timestamp ? value.toDate() : null;
}

function toFarmGame(gameId: string, data: DocumentData): FarmGame {
  const status: FarmGameStatus = data.status === "finished" || data.status === "cancelled" ? data.status : "selecting";
  const resolution =
    data.resolution === "direct" || data.resolution === "tie-wheel" || data.resolution === "all-wheel"
      ? (data.resolution as FarmResolution)
      : null;
  return {
    id: gameId,
    startedAt: toDate(data.startedAt),
    status,
    resolution,
    winnerUid: typeof data.winnerUid === "string" ? data.winnerUid : null,
  };
}

/** The id of the next round. Create it once per attempt of the admin's click, outside any transaction. */
export function newFarmGameId(boardId: string, db: Firestore = getFirebaseFirestore()): string {
  if (isMockMode()) return getMockBackend().newFarmGameId(boardId);
  return doc(collection(db, "boards", boardId, "farmGames")).id;
}

export function subscribeToFarmGame(
  boardId: string,
  gameId: string,
  onGame: (game: FarmGame | null) => void,
  onError: (error: unknown) => void,
  db: Firestore = getFirebaseFirestore(),
): Unsubscribe {
  if (isMockMode()) return getMockBackend().subscribeToFarmGame(boardId, gameId, onGame, onError);
  return onSnapshot(
    doc(db, "boards", boardId, "farmGames", gameId),
    (snapshot) => {
      const data = snapshot.data({ serverTimestamps: "estimate" });
      onGame(snapshot.exists() && data ? toFarmGame(snapshot.id, data) : null);
    },
    onError,
  );
}

/** Before the deadline a player can only read their own choice, so this listens to one document, never the collection. */
export function subscribeToMyFarmChoice(
  boardId: string,
  gameId: string,
  uid: string,
  onChoice: (field: FarmFieldId | null) => void,
  onError: (error: unknown) => void,
  db: Firestore = getFirebaseFirestore(),
): Unsubscribe {
  if (isMockMode()) return getMockBackend().subscribeToMyFarmChoice(boardId, gameId, uid, onChoice, onError);
  return onSnapshot(
    doc(db, "boards", boardId, "farmGames", gameId, "choices", uid),
    (snapshot) => {
      const field: unknown = snapshot.data()?.field;
      onChoice(isFarmFieldId(field) ? field : null);
    },
    onError,
  );
}

/** Only valid after the deadline. Before it the Rules reject the listener, so callers start it late and retry. */
export function subscribeToFarmChoices(
  boardId: string,
  gameId: string,
  onChoices: (choices: FarmChoice[]) => void,
  onError: (error: unknown) => void,
  db: Firestore = getFirebaseFirestore(),
): Unsubscribe {
  if (isMockMode()) return getMockBackend().subscribeToFarmChoices(boardId, gameId, onChoices, onError);
  return onSnapshot(
    collection(db, "boards", boardId, "farmGames", gameId, "choices"),
    (snapshot) =>
      onChoices(
        snapshot.docs.flatMap((choiceDoc) => {
          const field: unknown = choiceDoc.data().field;
          return isFarmFieldId(field) ? [{ uid: choiceDoc.id, field }] : [];
        }),
      ),
    onError,
  );
}

export async function chooseFarmField(
  boardId: string,
  gameId: string,
  uid: string,
  field: FarmFieldId,
  db: Firestore = getFirebaseFirestore(),
): Promise<void> {
  if (isMockMode()) return getMockBackend().chooseFarmField(boardId, gameId, uid, field);
  await setDoc(doc(db, "boards", boardId, "farmGames", gameId, "choices", uid), {
    field,
    updatedAt: serverTimestamp(),
  });
}

/** True when the uid is the current Host or a previous Host of the board (D163): they may not become the next Host. */
function isExcludedHost(board: DocumentData, uid: string): boolean {
  const past: unknown = board.pastHostUids;
  return excludedHostUids({
    ownerId: String(board.ownerId),
    hostUid: typeof board.hostUid === "string" ? board.hostUid : null,
    pastHostUids: Array.isArray(past) ? past.filter((entry): entry is string => typeof entry === "string") : [],
  }).includes(uid);
}

function isBoardOpenForFarm(board: DocumentData | undefined): board is DocumentData {
  return board !== undefined && (board.status ?? "in-progress") === "in-progress" && board.phase === 5;
}

/** Starts a round. The previous round must be finished, or cancelled with its fallback result stored (D156). */
export async function startFarmGame(
  boardId: string,
  gameId: string,
  db: Firestore = getFirebaseFirestore(),
): Promise<void> {
  if (isMockMode()) return getMockBackend().startFarmGame(boardId, gameId);
  const boardRef = doc(db, "boards", boardId);
  const newGameRef = doc(db, "boards", boardId, "farmGames", gameId);
  await runTransaction(
    db,
    async (transaction) => {
      const board = (await transaction.get(boardRef)).data();
      if (!isBoardOpenForFarm(board)) throw new FarmError("not-active", "The board is not in step 5");
      const previousGameId: unknown = board.farmActiveGameId;
      if (typeof previousGameId === "string") {
        const previousGame = (await transaction.get(doc(db, "boards", boardId, "farmGames", previousGameId))).data();
        const previousStatus = previousGame?.status;
        const mayStart =
          previousStatus === "finished" || (previousStatus === "cancelled" && board.nextHostGameId === previousGameId);
        if (!mayStart) {
          throw new FarmError(
            previousStatus === "cancelled" ? "fallback-pending" : "round-in-progress",
            "The previous round is not resolved",
          );
        }
      }
      transaction.set(newGameRef, { startedAt: serverTimestamp(), status: "selecting" });
      transaction.update(boardRef, { farmActiveGameId: gameId, updatedAt: serverTimestamp() });
    },
    TRANSACTION_OPTIONS,
  );
}

/**
 * Finishes the active round with a winner the caller already chose (D157). A direct winner does not touch
 * nextHostSpunAt because no wheel was spun; a wheel resolution sets it to the commit time.
 */
export async function finishFarmGame(
  boardId: string,
  gameId: string,
  winnerUid: string,
  resolution: FarmResolution,
  db: Firestore = getFirebaseFirestore(),
): Promise<void> {
  if (isMockMode()) return getMockBackend().finishFarmGame(boardId, gameId, winnerUid, resolution);
  const boardRef = doc(db, "boards", boardId);
  const gameRef = doc(db, "boards", boardId, "farmGames", gameId);
  await runTransaction(
    db,
    async (transaction) => {
      const board = (await transaction.get(boardRef)).data();
      const game = (await transaction.get(gameRef)).data();
      if (!isBoardOpenForFarm(board) || board.farmActiveGameId !== gameId || !game) {
        throw new FarmError("not-active", "This round is not the active round");
      }
      if (board.nextHostGameId === gameId || game.status === "finished") {
        throw new FarmError("already-resolved", "This round already has a result");
      }
      if (game.status !== "selecting") throw new FarmError("not-active", "This round was cancelled");
      if (isExcludedHost(board, winnerUid)) {
        throw new FarmError("host-excluded", "The current or a previous Host cannot be next Host");
      }
      // Whether the winner played is checked by the Rules (farmPlayer): a member can only `get` their own member document.
      transaction.update(gameRef, { status: "finished", resolution, winnerUid, resolvedAt: serverTimestamp() });
      transaction.update(boardRef, {
        nextHostUid: winnerUid,
        nextHostGameId: gameId,
        updatedAt: serverTimestamp(),
        ...(resolution === "direct" ? {} : { nextHostSpunAt: serverTimestamp() }),
      });
    },
    TRANSACTION_OPTIONS,
  );
}

/** Cancels the active selecting round. The cancelled round keeps no winner (D157). */
export async function cancelFarmGame(
  boardId: string,
  gameId: string,
  db: Firestore = getFirebaseFirestore(),
): Promise<void> {
  if (isMockMode()) return getMockBackend().cancelFarmGame(boardId, gameId);
  const boardRef = doc(db, "boards", boardId);
  const gameRef = doc(db, "boards", boardId, "farmGames", gameId);
  await runTransaction(
    db,
    async (transaction) => {
      const board = (await transaction.get(boardRef)).data();
      const game = (await transaction.get(gameRef)).data();
      if (!isBoardOpenForFarm(board) || board.farmActiveGameId !== gameId || !game) {
        throw new FarmError("not-active", "This round is not the active round");
      }
      if (game.status !== "selecting") throw new FarmError("already-resolved", "This round already ended");
      transaction.update(gameRef, { status: "cancelled", resolvedAt: serverTimestamp() });
    },
    TRANSACTION_OPTIONS,
  );
}

/** Stores the wheel result of a cancelled round on the board, once, while that round is still the active one. */
export async function storeCancelledFarmFallback(
  boardId: string,
  gameId: string,
  winnerUid: string,
  db: Firestore = getFirebaseFirestore(),
): Promise<void> {
  if (isMockMode()) return getMockBackend().storeCancelledFarmFallback(boardId, gameId, winnerUid);
  const boardRef = doc(db, "boards", boardId);
  const gameRef = doc(db, "boards", boardId, "farmGames", gameId);
  await runTransaction(
    db,
    async (transaction) => {
      const board = (await transaction.get(boardRef)).data();
      const game = (await transaction.get(gameRef)).data();
      if (!isBoardOpenForFarm(board) || board.farmActiveGameId !== gameId || game?.status !== "cancelled") {
        throw new FarmError("not-active", "This round is not the active cancelled round");
      }
      if (board.nextHostGameId === gameId) {
        throw new FarmError("already-resolved", "The fallback result is already stored");
      }
      if (isExcludedHost(board, winnerUid)) {
        throw new FarmError("host-excluded", "The current or a previous Host cannot be next Host");
      }
      // Whether the winner played is checked by the Rules (farmPlayer): a member can only `get` their own member document.
      transaction.update(boardRef, {
        nextHostUid: winnerUid,
        nextHostSpunAt: serverTimestamp(),
        nextHostGameId: gameId,
        updatedAt: serverTimestamp(),
      });
    },
    TRANSACTION_OPTIONS,
  );
}

const FISHING_GAME_STATUSES: ReadonlySet<string> = new Set<FishingGameStatus>([
  "selecting-wheel",
  "fishing",
  "scoring",
  "finished",
  "cancelled",
]);

const WHEEL_SEGMENTS: ReadonlySet<string> = new Set<WheelSegment>([
  "small-fish",
  "big-fish",
  "golden-fish",
  "lucky",
  "double-points",
  "rare-fish",
]);

function toFishingGame(gameId: string, data: DocumentData): FishingGame | null {
  if (data.gameType !== "fishing") return null;
  const rawStatus: unknown = data.status;
  const status: FishingGameStatus =
    typeof rawStatus === "string" && FISHING_GAME_STATUSES.has(rawStatus)
      ? (rawStatus as FishingGameStatus)
      : "selecting-wheel";
  const rawSegment: unknown = data.wheelSegment;
  const wheelSegment: WheelSegment | null =
    typeof rawSegment === "string" && WHEEL_SEGMENTS.has(rawSegment)
      ? (rawSegment as WheelSegment)
      : null;
  const rawDuration = data.fishingDurationSec;
  const fishingDurationSec: 30 | 45 | 60 = rawDuration === 45 ? 45 : rawDuration === 60 ? 60 : 30;
  const rawResolution: unknown = data.resolution;
  const resolution: "wheel" | "golden-hook" | "none" | null =
    rawResolution === "wheel" ? "wheel"
    : rawResolution === "golden-hook" ? "golden-hook"
    : rawResolution === "none" ? "none"
    : null;

  const rawRS = data.resolvedState;
  let resolvedState: FishingGame["resolvedState"] = null;
  if (rawRS && typeof rawRS === "object") {
    resolvedState = {
      safeCatchUids: Array.isArray(rawRS.safeCatchUids)
        ? rawRS.safeCatchUids.filter((u: unknown): u is string => typeof u === "string")
        : [],
      goldenHookWinner: typeof rawRS.goldenHookWinner === "string" ? rawRS.goldenHookWinner : null,
      baitTrapMap:
        rawRS.baitTrapMap && typeof rawRS.baitTrapMap === "object"
          ? (rawRS.baitTrapMap as Record<string, string>)
          : {},
      finalCandidateUids: Array.isArray(rawRS.finalCandidateUids)
        ? rawRS.finalCandidateUids.filter((u: unknown): u is string => typeof u === "string")
        : [],
      reSpinGrantCount: typeof rawRS.reSpinGrantCount === "number" ? rawRS.reSpinGrantCount : 0,
      resolvedAt: toDate(rawRS.resolvedAt),
    };
  }

  return {
    id: gameId,
    gameType: "fishing",
    status,
    startedAt: toDate(data.startedAt),
    wheelSegment,
    wheelSpunAt: toDate(data.wheelSpunAt),
    fishingEndsAt: toDate(data.fishingEndsAt),
    fishingDurationSec,
    ignoredUids: Array.isArray(data.ignoredUids)
      ? data.ignoredUids.filter((uid): uid is string => typeof uid === "string")
      : [],
    powerShopEndsAt: toDate(data.powerShopEndsAt),
    reSpinCount: typeof data.reSpinCount === "number" ? data.reSpinCount : 0,
    resolvedState,
    resolution,
    winnerUid: typeof data.winnerUid === "string" ? data.winnerUid : null,
    resolvedAt: toDate(data.resolvedAt),
  };
}

const POWER_ACTION_TYPES: ReadonlySet<string> = new Set<PowerActionType>([
  "lucky-respin",
  "right-neighbor",
  "safe-catch",
  "fishy-shuffle",
  "golden-hook",
  "bait-trap",
]);

function toPowerPoints(uid: string, data: DocumentData): PowerPoints {
  return {
    uid,
    balance: typeof data.balance === "number" ? Math.max(0, data.balance) : 0,
    earned: typeof data.earned === "number" ? Math.max(0, data.earned) : 0,
    updatedAt: toDate(data.updatedAt),
  };
}

function toPowerAction(uid: string, data: DocumentData): PowerAction | null {
  const rawType: unknown = data.type;
  if (typeof rawType !== "string" || !POWER_ACTION_TYPES.has(rawType)) return null;
  return {
    uid,
    type: rawType as PowerActionType,
    targetUid: typeof data.targetUid === "string" ? data.targetUid : null,
    cost: typeof data.cost === "number" ? data.cost : 0,
    submittedAt: toDate(data.submittedAt),
    updatedAt: toDate(data.updatedAt),
  };
}

function toFishCatch(uid: string, data: DocumentData): FishCatch {
  return {
    uid,
    catchCount: typeof data.catchCount === "number" ? data.catchCount : 0,
    lastCatchAt: toDate(data.lastCatchAt),
    updatedAt: toDate(data.updatedAt),
  };
}

export async function startFishingGame(
  boardId: string,
  durationSec: 30 | 45 | 60,
  db: Firestore = getFirebaseFirestore(),
): Promise<void> {
  if (isMockMode()) return getMockBackend().startFishingGame(boardId, durationSec);
  const newId = newFarmGameId(boardId, db);
  const batch = writeBatch(db);
  batch.set(doc(db, "boards", boardId, "farmGames", newId), {
    gameType: "fishing",
    status: "selecting-wheel",
    startedAt: serverTimestamp(),
    fishingDurationSec: durationSec,
    ignoredUids: [],
    wheelSegment: null,
    wheelSpunAt: null,
    fishingEndsAt: null,
    resolution: null,
    winnerUid: null,
    resolvedAt: null,
  });
  batch.update(doc(db, "boards", boardId), {
    farmActiveGameId: newId,
    updatedAt: serverTimestamp(),
  });
  await batch.commit();
}

export async function spinActivityWheel(
  boardId: string,
  gameId: string,
  segment: WheelSegment,
  db: Firestore = getFirebaseFirestore(),
): Promise<void> {
  if (isMockMode()) return getMockBackend().spinActivityWheel(boardId, gameId, segment);
  const gameRef = doc(db, "boards", boardId, "farmGames", gameId);
  await runTransaction(
    db,
    async (transaction) => {
      const gameSnap = await transaction.get(gameRef);
      const data = gameSnap.data({ serverTimestamps: "estimate" });
      const fishingDurationSec: number =
        typeof data?.fishingDurationSec === "number" ? data.fishingDurationSec : 30;
      // fishingEndsAt is based on the spin time, not the game creation time, so the
      // full fishing window is always available after the wheel lands.
      transaction.update(gameRef, {
        wheelSegment: segment,
        wheelSpunAt: serverTimestamp(),
        status: "fishing",
        fishingEndsAt: Timestamp.fromMillis(Timestamp.now().toMillis() + fishingDurationSec * 1000),
        updatedAt: serverTimestamp(),
      });
    },
    TRANSACTION_OPTIONS,
  );
}

export async function recordCatch(
  boardId: string,
  gameId: string,
  uid: string,
  db: Firestore = getFirebaseFirestore(),
): Promise<void> {
  if (isMockMode()) return getMockBackend().recordCatch(boardId, gameId, uid);
  await setDoc(
    doc(db, "boards", boardId, "farmGames", gameId, "catches", uid),
    { catchCount: increment(1), lastCatchAt: serverTimestamp(), updatedAt: serverTimestamp() },
    { merge: true },
  );
}

export async function endFishing(
  boardId: string,
  gameId: string,
  db: Firestore = getFirebaseFirestore(),
): Promise<void> {
  if (isMockMode()) return getMockBackend().endFishing(boardId, gameId);
  await updateDoc(doc(db, "boards", boardId, "farmGames", gameId), {
    status: "scoring",
    updatedAt: serverTimestamp(),
  });
}

export async function finishFishingGame(
  boardId: string,
  gameId: string,
  winnerUid: string,
  db: Firestore = getFirebaseFirestore(),
): Promise<void> {
  if (isMockMode()) return getMockBackend().finishFishingGame(boardId, gameId, winnerUid);
  const batch = writeBatch(db);
  batch.update(doc(db, "boards", boardId, "farmGames", gameId), {
    status: "finished",
    resolution: "wheel",
    winnerUid,
    resolvedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  batch.update(doc(db, "boards", boardId), {
    nextHostUid: winnerUid,
    nextHostGameId: gameId,
    nextHostSpunAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await batch.commit();
}

export async function setIgnoredUids(
  boardId: string,
  gameId: string,
  uids: string[],
  db: Firestore = getFirebaseFirestore(),
): Promise<void> {
  if (isMockMode()) return getMockBackend().setIgnoredUids(boardId, gameId, uids);
  await updateDoc(doc(db, "boards", boardId, "farmGames", gameId), {
    ignoredUids: uids,
    updatedAt: serverTimestamp(),
  });
}

export function subscribeToFishingGame(
  boardId: string,
  gameId: string,
  cb: (game: FishingGame | null) => void,
  onError: (error: unknown) => void,
  db: Firestore = getFirebaseFirestore(),
): Unsubscribe {
  if (isMockMode()) return getMockBackend().subscribeToFishingGame(boardId, gameId, cb, onError);
  return onSnapshot(
    doc(db, "boards", boardId, "farmGames", gameId),
    (snapshot) => {
      const data = snapshot.data({ serverTimestamps: "estimate" });
      cb(snapshot.exists() && data ? toFishingGame(snapshot.id, data) : null);
    },
    onError,
  );
}

export function subscribeToFishCatches(
  boardId: string,
  gameId: string,
  cb: (catches: FishCatch[]) => void,
  onError: (error: unknown) => void,
  db: Firestore = getFirebaseFirestore(),
): Unsubscribe {
  if (isMockMode()) return getMockBackend().subscribeToFishCatches(boardId, gameId, cb, onError);
  return onSnapshot(
    collection(db, "boards", boardId, "farmGames", gameId, "catches"),
    (snapshot) => {
      cb(
        snapshot.docs.map((catchDoc) => toFishCatch(catchDoc.id, catchDoc.data({ serverTimestamps: "estimate" }))),
      );
    },
    onError,
  );
}

function powerPointsPath(boardId: string, gameId: string, uid: string, db: Firestore) {
  return doc(db, "boards", boardId, "farmGames", gameId, "powerPoints", uid);
}

function powerActionPath(boardId: string, gameId: string, uid: string, db: Firestore) {
  return doc(db, "boards", boardId, "farmGames", gameId, "powerActions", uid);
}

/** Admin writes locked Power Points for all players after fishing ends (scoring phase entry). */
export async function lockPowerPoints(
  boardId: string,
  gameId: string,
  points: { uid: string; balance: number; earned: number }[],
  db: Firestore = getFirebaseFirestore(),
): Promise<void> {
  if (isMockMode()) return getMockBackend().lockPowerPoints(boardId, gameId, points);
  const batch = writeBatch(db);
  for (const p of points) {
    batch.set(powerPointsPath(boardId, gameId, p.uid, db), {
      balance: p.balance,
      earned: p.earned,
      updatedAt: serverTimestamp(),
    });
  }
  await batch.commit();
}

/** Player submits a Power Action. Atomically deducts balance from their powerPoints doc. */
export async function submitPowerAction(
  boardId: string,
  gameId: string,
  uid: string,
  type: PowerActionType,
  targetUid: string | null,
  db: Firestore = getFirebaseFirestore(),
): Promise<void> {
  if (isMockMode()) return getMockBackend().submitPowerAction(boardId, gameId, uid, type, targetUid);
  const cost = POWER_ACTION_COSTS[type];
  const ppRef = powerPointsPath(boardId, gameId, uid, db);
  const paRef = powerActionPath(boardId, gameId, uid, db);
  await runTransaction(
    db,
    async (transaction) => {
      const ppSnap = await transaction.get(ppRef);
      const paSnap = await transaction.get(paRef);
      if (paSnap.exists()) throw new FarmError("already-resolved", "A Power Action was already submitted this round");
      const balance: number = ppSnap.exists() ? (ppSnap.data()?.balance ?? 0) : 0;
      if (balance < cost) throw new FarmError("not-active", "Insufficient Power Points");
      transaction.set(paRef, {
        type,
        targetUid: targetUid ?? null,
        cost,
        submittedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      transaction.update(ppRef, { balance: balance - cost, updatedAt: serverTimestamp() });
    },
    TRANSACTION_OPTIONS,
  );
}

/** Admin closes the Power Shop and writes the resolved state, transitioning to the wheel phase. */
export async function resolveAndTransitionToWheel(
  boardId: string,
  gameId: string,
  resolvedState: Omit<ResolvedState, "resolvedAt">,
  db: Firestore = getFirebaseFirestore(),
): Promise<void> {
  if (isMockMode()) return getMockBackend().resolveAndTransitionToWheel(boardId, gameId, resolvedState);
  await updateDoc(doc(db, "boards", boardId, "farmGames", gameId), {
    status: "wheel",
    resolvedState: { ...resolvedState, resolvedAt: serverTimestamp() },
    updatedAt: serverTimestamp(),
  });
}

/** Admin spins the Next Host Wheel during the wheel phase (or directly applies Golden Hook). */
export async function spinFishingHostWheel(
  boardId: string,
  gameId: string,
  winnerUid: string,
  resolution: "wheel" | "golden-hook",
  db: Firestore = getFirebaseFirestore(),
): Promise<void> {
  if (isMockMode()) return getMockBackend().spinFishingHostWheel(boardId, gameId, winnerUid, resolution);
  const batch = writeBatch(db);
  batch.update(doc(db, "boards", boardId, "farmGames", gameId), {
    status: "finished",
    resolution,
    winnerUid,
    resolvedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  batch.update(doc(db, "boards", boardId), {
    nextHostUid: winnerUid,
    nextHostGameId: gameId,
    nextHostSpunAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await batch.commit();
}

/** Admin re-spins the host wheel (Lucky Re-spin). Increments reSpinCount before picking the new winner. */
export async function reSpinFishingHostWheel(
  boardId: string,
  gameId: string,
  db: Firestore = getFirebaseFirestore(),
): Promise<number> {
  if (isMockMode()) return getMockBackend().reSpinFishingHostWheel(boardId, gameId);
  const gameRef = doc(db, "boards", boardId, "farmGames", gameId);
  let newCount = 0;
  await runTransaction(
    db,
    async (transaction) => {
      const snap = await transaction.get(gameRef);
      const current: number = snap.data()?.reSpinCount ?? 0;
      if (current >= MAX_RESPINS) throw new FarmError("not-active", "Re-spin limit reached");
      newCount = current + 1;
      transaction.update(gameRef, { reSpinCount: newCount, updatedAt: serverTimestamp() });
    },
    TRANSACTION_OPTIONS,
  );
  return newCount;
}

export function subscribeToFishingPowerPoints(
  boardId: string,
  gameId: string,
  cb: (points: PowerPoints[]) => void,
  onError: (error: unknown) => void,
  db: Firestore = getFirebaseFirestore(),
): Unsubscribe {
  if (isMockMode()) return getMockBackend().subscribeToFishingPowerPoints(boardId, gameId, cb, onError);
  return onSnapshot(
    collection(db, "boards", boardId, "farmGames", gameId, "powerPoints"),
    (snapshot) => {
      cb(snapshot.docs.map((d) => toPowerPoints(d.id, d.data({ serverTimestamps: "estimate" }))));
    },
    onError,
  );
}

export function subscribeToFishingPowerActions(
  boardId: string,
  gameId: string,
  cb: (actions: PowerAction[]) => void,
  onError: (error: unknown) => void,
  db: Firestore = getFirebaseFirestore(),
): Unsubscribe {
  if (isMockMode()) return getMockBackend().subscribeToFishingPowerActions(boardId, gameId, cb, onError);
  return onSnapshot(
    collection(db, "boards", boardId, "farmGames", gameId, "powerActions"),
    (snapshot) => {
      cb(
        snapshot.docs.flatMap((d) => {
          const action = toPowerAction(d.id, d.data({ serverTimestamps: "estimate" }));
          return action ? [action] : [];
        }),
      );
    },
    onError,
  );
}

// ---- Treasure Rush functions ----

const TREASURE_GAME_STATUSES: ReadonlySet<string> = new Set<TreasureGameStatus>([
  "idle",
  "preparation",
  "playing",
  "settlement",
  "host_selection",
  "finished",
]);

const TREASURE_MODIFIER_SET: ReadonlySet<string> = new Set<TreasureModifier>([
  "gem-fever",
  "coin-rain",
  "safe-expedition",
  "royal-treasure",
  "lucky-explorer",
  "double-treasure",
]);

const TREASURE_POWER_ACTION_TYPE_SET: ReadonlySet<string> = new Set<TreasurePowerActionType>([
  "trap-shield",
  "gem-bonus",
  "double-loot",
  "lucky-reroll",
  "royal-bonus",
]);

function toTreasureGame(gameId: string, data: DocumentData): TreasureGame | null {
  if (data.gameType !== "treasure") return null;
  const rawStatus: unknown = data.status;
  const status: TreasureGameStatus =
    typeof rawStatus === "string" && TREASURE_GAME_STATUSES.has(rawStatus)
      ? (rawStatus as TreasureGameStatus)
      : "idle";
  const rawModifier: unknown = data.activityModifier;
  const activityModifier: TreasureModifier | null =
    typeof rawModifier === "string" && TREASURE_MODIFIER_SET.has(rawModifier)
      ? (rawModifier as TreasureModifier)
      : null;
  const rawDuration = data.durationSec;
  const durationSec: 60 | 90 | 120 | 180 =
    rawDuration === 90 ? 90
    : rawDuration === 120 ? 120
    : rawDuration === 180 ? 180
    : 60;
  const rawRS = data.resolvedState;
  let resolvedState: TreasureGame["resolvedState"] = null;
  if (rawRS && typeof rawRS === "object") {
    resolvedState = {
      finalCandidateUids: Array.isArray(rawRS.finalCandidateUids)
        ? (rawRS.finalCandidateUids as unknown[]).filter((u): u is string => typeof u === "string")
        : [],
      reSpinGrantCount: typeof rawRS.reSpinGrantCount === "number" ? rawRS.reSpinGrantCount : 0,
      resolvedAt: toDate(rawRS.resolvedAt),
    };
  }
  const rawAchievements = data.achievements;
  let achievements: AchievementResult[] | null = null;
  if (Array.isArray(rawAchievements)) {
    achievements = (rawAchievements as unknown[]).flatMap((a) => {
      if (
        typeof a !== "object" || a === null ||
        typeof (a as Record<string, unknown>).type !== "string" ||
        typeof (a as Record<string, unknown>).winnerUid !== "string"
      ) return [];
      return [{ type: (a as Record<string, unknown>).type as AchievementResult["type"], winnerUid: (a as Record<string, unknown>).winnerUid as string }];
    });
  }

  return {
    id: gameId,
    gameType: "treasure",
    status,
    startedAt: toDate(data.startedAt),
    durationSec,
    endsAt: toDate(data.endsAt),
    activityModifier,
    ignoredUids: Array.isArray(data.ignoredUids)
      ? (data.ignoredUids as unknown[]).filter((uid): uid is string => typeof uid === "string")
      : [],
    reSpinCount: typeof data.reSpinCount === "number" ? data.reSpinCount : 0,
    resolvedState,
    resolution: data.resolution === "wheel" ? "wheel" : null,
    winnerUid: typeof data.winnerUid === "string" ? data.winnerUid : null,
    resolvedAt: toDate(data.resolvedAt),
    achievements,
  };
}

function toTreasurePlayerState(uid: string, data: DocumentData): TreasurePlayerState {
  return {
    uid,
    openedCount: typeof data.openedCount === "number" ? data.openedCount : 0,
    currentRunPoints: typeof data.currentRunPoints === "number" ? data.currentRunPoints : 0,
    currentRunGem: typeof data.currentRunGem === "number" ? data.currentRunGem : 0,
    currentRunCoin: typeof data.currentRunCoin === "number" ? data.currentRunCoin : 0,
    currentRunCrown: typeof data.currentRunCrown === "number" ? data.currentRunCrown : 0,
    bankedPoints: typeof data.bankedPoints === "number" ? data.bankedPoints : 0,
    gemBanked: typeof data.gemBanked === "number" ? data.gemBanked : 0,
    coinBanked: typeof data.coinBanked === "number" ? data.coinBanked : 0,
    crownBanked: typeof data.crownBanked === "number" ? data.crownBanked : 0,
    bankCount: typeof data.bankCount === "number" ? data.bankCount : 0,
    trapHit: data.trapHit === true,
    maxSingleReward: typeof data.maxSingleReward === "number" ? data.maxSingleReward : 0,
    score: typeof data.score === "number" ? data.score : 0,
    lastActionAt: toDate(data.lastActionAt),
    updatedAt: toDate(data.updatedAt),
    tcSpentOnItems: typeof data.tcSpentOnItems === "number" ? data.tcSpentOnItems : 0,
    attacksSent: typeof data.attacksSent === "number" ? data.attacksSent : 0,
    attacksBlocked: typeof data.attacksBlocked === "number" ? data.attacksBlocked : 0,
    tcLostToAttacks: typeof data.tcLostToAttacks === "number" ? data.tcLostToAttacks : 0,
    frozenUntilMs: typeof data.frozenUntilMs === "number" ? data.frozenUntilMs : null,
  };
}

function toTreasurePowerAction(uid: string, data: DocumentData): TreasurePowerAction | null {
  const rawType: unknown = data.type;
  if (typeof rawType !== "string" || !TREASURE_POWER_ACTION_TYPE_SET.has(rawType)) return null;
  return {
    uid,
    type: rawType as TreasurePowerActionType,
    cost: typeof data.cost === "number" ? data.cost : 0,
    submittedAt: toDate(data.submittedAt),
    updatedAt: toDate(data.updatedAt),
  };
}

/** Admin creates a Treasure Rush game and updates the board pointer. Returns the new gameId. */
export async function startTreasureRush(
  boardId: string,
  durationSec: 60 | 90 | 120 | 180,
  db: Firestore = getFirebaseFirestore(),
): Promise<string> {
  if (isMockMode()) return getMockBackend().startTreasureRush(boardId, durationSec);
  const gameId = newFarmGameId(boardId, db);
  const batch = writeBatch(db);
  batch.set(doc(db, "boards", boardId, "farmGames", gameId), {
    gameType: "treasure",
    status: "preparation",
    startedAt: serverTimestamp(),
    durationSec,
    endsAt: null,
    activityModifier: null,
    ignoredUids: [],
    reSpinCount: 0,
    resolvedState: null,
    resolution: null,
    winnerUid: null,
    resolvedAt: null,
    achievements: null,
  });
  batch.update(doc(db, "boards", boardId), {
    farmActiveGameId: gameId,
    updatedAt: serverTimestamp(),
  });
  await batch.commit();
  return gameId;
}

/** Admin spins the Activity Wheel, sets the modifier, and transitions the game to "playing". */
export async function spinTreasureWheel(
  boardId: string,
  gameId: string,
  modifier: TreasureModifier,
  db: Firestore = getFirebaseFirestore(),
): Promise<void> {
  if (isMockMode()) return getMockBackend().spinTreasureWheel(boardId, gameId, modifier);
  const gameRef = doc(db, "boards", boardId, "farmGames", gameId);
  await runTransaction(
    db,
    async (transaction) => {
      const snap = await transaction.get(gameRef);
      const data = snap.data({ serverTimestamps: "estimate" });
      if (!snap.exists() || data?.gameType !== "treasure") {
        throw new FarmError("not-active", "Not a Treasure Rush game");
      }
      if (data.status !== "preparation") throw new FarmError("not-active", "Game is not in preparation state");
      const duration: number = typeof data.durationSec === "number" ? data.durationSec : 60;
      transaction.update(gameRef, {
        activityModifier: modifier,
        status: "playing",
        endsAt: Timestamp.fromMillis(Timestamp.now().toMillis() + duration * 1000),
        updatedAt: serverTimestamp(),
      });
    },
    TRANSACTION_OPTIONS,
  );
}

/** Admin writes chest boards for all players before or at the "playing" transition. */
export async function writeChestBoards(
  boardId: string,
  gameId: string,
  boards: { uid: string; chests: TreasureChest[] }[],
  db: Firestore = getFirebaseFirestore(),
): Promise<void> {
  if (isMockMode()) return getMockBackend().writeChestBoards(boardId, gameId, boards);
  const batch = writeBatch(db);
  for (const { uid, chests } of boards) {
    batch.set(doc(db, "boards", boardId, "farmGames", gameId, "chestBoards", uid), {
      chests,
      seededAt: serverTimestamp(),
    });
  }
  await batch.commit();
}

/** Subscribe to the chest board for one player. */
export function subscribeToMyChestBoard(
  boardId: string,
  gameId: string,
  uid: string,
  cb: (chests: TreasureChest[] | null) => void,
  onError: (error: unknown) => void,
  db: Firestore = getFirebaseFirestore(),
): Unsubscribe {
  if (isMockMode()) return getMockBackend().subscribeToMyChestBoard(boardId, gameId, uid, cb, onError);
  return onSnapshot(
    doc(db, "boards", boardId, "farmGames", gameId, "chestBoards", uid),
    (snapshot) => {
      const data = snapshot.data({ serverTimestamps: "estimate" });
      if (!snapshot.exists() || !data) { cb(null); return; }
      const rawChests: unknown = data.chests;
      if (!Array.isArray(rawChests)) { cb(null); return; }
      const chests: TreasureChest[] = (rawChests as unknown[]).flatMap((raw) => {
        if (
          typeof raw !== "object" ||
          raw === null ||
          typeof (raw as Record<string, unknown>).type !== "string" ||
          typeof (raw as Record<string, unknown>).basePoints !== "number"
        ) return [];
        return [{ type: (raw as Record<string, unknown>).type as ChestType, basePoints: (raw as Record<string, unknown>).basePoints as number }];
      });
      cb(chests);
    },
    onError,
  );
}

/**
 * Player opens the next chest in sequence. Reads the chest data authoritatively from chestBoards in the transaction
 * to prevent spoofing. Updates openedCount, currentRunPoints, currentRun gem/coin/crown counters, and trapHit.
 */
export async function openChest(
  boardId: string,
  gameId: string,
  uid: string,
  chestIndex: number,
  db: Firestore = getFirebaseFirestore(),
): Promise<void> {
  if (isMockMode()) return getMockBackend().openChest(boardId, gameId, uid, chestIndex);
  const gameRef = doc(db, "boards", boardId, "farmGames", gameId);
  const chestBoardRef = doc(db, "boards", boardId, "farmGames", gameId, "chestBoards", uid);
  const playerStateRef = doc(db, "boards", boardId, "farmGames", gameId, "playerState", uid);
  await runTransaction(
    db,
    async (transaction) => {
      const [gameSnap, cbSnap, psSnap] = await Promise.all([
        transaction.get(gameRef),
        transaction.get(chestBoardRef),
        transaction.get(playerStateRef),
      ]);
      const gameData = gameSnap.data({ serverTimestamps: "estimate" });
      if (!gameSnap.exists() || gameData?.status !== "playing") {
        throw new FarmError("not-active", "Game is not in playing state");
      }
      const endsAt: unknown = gameData.endsAt;
      if (endsAt instanceof Timestamp && endsAt.toMillis() <= Timestamp.now().toMillis()) {
        throw new FarmError("not-active", "Game has ended");
      }
      const cbData = cbSnap.data();
      if (!cbSnap.exists() || !cbData) throw new FarmError("not-active", "Chest board not found");
      const rawChests: unknown = cbData.chests;
      if (!Array.isArray(rawChests) || chestIndex < 0 || chestIndex >= rawChests.length) {
        throw new FarmError("not-active", "Invalid chest index");
      }
      const psData = psSnap.data() ?? {};
      const openedCount: number = typeof psData.openedCount === "number" ? psData.openedCount : 0;
      if (chestIndex !== openedCount) {
        throw new FarmError("not-active", "Chests must be opened sequentially");
      }
      const rawChest = rawChests[chestIndex];
      if (
        typeof rawChest !== "object" ||
        rawChest === null ||
        typeof (rawChest as Record<string, unknown>).type !== "string" ||
        typeof (rawChest as Record<string, unknown>).basePoints !== "number"
      ) {
        throw new FarmError("not-active", "Invalid chest data");
      }
      const chestType = (rawChest as Record<string, unknown>).type as ChestType;
      const basePoints = (rawChest as Record<string, unknown>).basePoints as number;
      const isTrap = chestType === "trap";
      const currentRunPoints: number = typeof psData.currentRunPoints === "number" ? psData.currentRunPoints : 0;
      const newRunPoints = Math.max(0, currentRunPoints + basePoints);
      const currentRunGem: number = typeof psData.currentRunGem === "number" ? psData.currentRunGem : 0;
      const currentRunCoin: number = typeof psData.currentRunCoin === "number" ? psData.currentRunCoin : 0;
      const currentRunCrown: number = typeof psData.currentRunCrown === "number" ? psData.currentRunCrown : 0;
      const prevMaxSingleReward: number = typeof psData.maxSingleReward === "number" ? psData.maxSingleReward : 0;
      const gemAdd = chestType === "gem" ? basePoints : 0;
      const coinAdd = chestType === "coins" ? basePoints : 0;
      const crownAdd = chestType === "crown" ? basePoints : 0;
      const newMaxSingleReward = Math.max(prevMaxSingleReward, Math.max(0, basePoints));
      if (psSnap.exists()) {
        transaction.update(playerStateRef, {
          openedCount: openedCount + 1,
          currentRunPoints: newRunPoints,
          currentRunGem: currentRunGem + gemAdd,
          currentRunCoin: currentRunCoin + coinAdd,
          currentRunCrown: currentRunCrown + crownAdd,
          maxSingleReward: newMaxSingleReward,
          ...(isTrap ? { trapHit: true } : {}),
          lastActionAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else {
        transaction.set(playerStateRef, {
          openedCount: 1,
          currentRunPoints: newRunPoints,
          currentRunGem: gemAdd,
          currentRunCoin: coinAdd,
          currentRunCrown: crownAdd,
          bankedPoints: 0,
          gemBanked: 0,
          coinBanked: 0,
          crownBanked: 0,
          bankCount: 0,
          trapHit: isTrap,
          maxSingleReward: newMaxSingleReward,
          score: 0,
          lastActionAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    },
    TRANSACTION_OPTIONS,
  );
}

/** Player banks their current run, adding currentRunPoints to bankedPoints and resetting run state. Idempotent when currentRunPoints is 0. */
export async function bankTreasure(
  boardId: string,
  gameId: string,
  uid: string,
  db: Firestore = getFirebaseFirestore(),
): Promise<void> {
  if (isMockMode()) return getMockBackend().bankTreasure(boardId, gameId, uid);
  const gameRef = doc(db, "boards", boardId, "farmGames", gameId);
  const playerStateRef = doc(db, "boards", boardId, "farmGames", gameId, "playerState", uid);
  await runTransaction(
    db,
    async (transaction) => {
      const [gameSnap, psSnap] = await Promise.all([
        transaction.get(gameRef),
        transaction.get(playerStateRef),
      ]);
      const gameData = gameSnap.data({ serverTimestamps: "estimate" });
      if (!gameSnap.exists() || gameData?.status !== "playing") {
        throw new FarmError("not-active", "Game is not in playing state");
      }
      const psData = psSnap.data() ?? {};
      const currentRunPoints: number = typeof psData.currentRunPoints === "number" ? psData.currentRunPoints : 0;
      if (currentRunPoints === 0) return;
      const bankedPoints: number = typeof psData.bankedPoints === "number" ? psData.bankedPoints : 0;
      const currentRunGem: number = typeof psData.currentRunGem === "number" ? psData.currentRunGem : 0;
      const currentRunCoin: number = typeof psData.currentRunCoin === "number" ? psData.currentRunCoin : 0;
      const currentRunCrown: number = typeof psData.currentRunCrown === "number" ? psData.currentRunCrown : 0;
      const gemBanked: number = typeof psData.gemBanked === "number" ? psData.gemBanked : 0;
      const coinBanked: number = typeof psData.coinBanked === "number" ? psData.coinBanked : 0;
      const crownBanked: number = typeof psData.crownBanked === "number" ? psData.crownBanked : 0;
      const bankCount: number = typeof psData.bankCount === "number" ? psData.bankCount : 0;
      const bankFields = {
        bankedPoints: bankedPoints + currentRunPoints,
        gemBanked: gemBanked + currentRunGem,
        coinBanked: coinBanked + currentRunCoin,
        crownBanked: crownBanked + currentRunCrown,
        currentRunPoints: 0,
        currentRunGem: 0,
        currentRunCoin: 0,
        currentRunCrown: 0,
        bankCount: bankCount + 1,
        updatedAt: serverTimestamp(),
      };
      if (psSnap.exists()) {
        transaction.update(playerStateRef, bankFields);
      } else {
        transaction.set(playerStateRef, {
          openedCount: 0,
          ...bankFields,
          trapHit: false,
          score: 0,
          lastActionAt: serverTimestamp(),
        });
      }
    },
    TRANSACTION_OPTIONS,
  );
}

/** Admin ends the playing phase and transitions to settlement. */
export async function endTreasureRush(
  boardId: string,
  gameId: string,
  db: Firestore = getFirebaseFirestore(),
): Promise<void> {
  if (isMockMode()) return getMockBackend().endTreasureRush(boardId, gameId);
  await updateDoc(doc(db, "boards", boardId, "farmGames", gameId), {
    status: "settlement",
    updatedAt: serverTimestamp(),
  });
}

export function subscribeToTreasureGame(
  boardId: string,
  gameId: string,
  cb: (game: TreasureGame | null) => void,
  onError: (error: unknown) => void,
  db: Firestore = getFirebaseFirestore(),
): Unsubscribe {
  if (isMockMode()) return getMockBackend().subscribeToTreasureGame(boardId, gameId, cb, onError);
  return onSnapshot(
    doc(db, "boards", boardId, "farmGames", gameId),
    (snapshot) => {
      const data = snapshot.data({ serverTimestamps: "estimate" });
      cb(snapshot.exists() && data ? toTreasureGame(snapshot.id, data) : null);
    },
    onError,
  );
}

export function subscribeToTreasurePlayerStates(
  boardId: string,
  gameId: string,
  cb: (states: TreasurePlayerState[]) => void,
  onError: (error: unknown) => void,
  db: Firestore = getFirebaseFirestore(),
): Unsubscribe {
  if (isMockMode()) return getMockBackend().subscribeToTreasurePlayerStates(boardId, gameId, cb, onError);
  return onSnapshot(
    collection(db, "boards", boardId, "farmGames", gameId, "playerState"),
    (snapshot) => {
      cb(snapshot.docs.map((d) => toTreasurePlayerState(d.id, d.data({ serverTimestamps: "estimate" }))));
    },
    onError,
  );
}

/** Admin writes final scores for each player at the scoring phase. */
export async function lockTreasureScores(
  boardId: string,
  gameId: string,
  scores: { uid: string; score: number }[],
  db: Firestore = getFirebaseFirestore(),
): Promise<void> {
  if (isMockMode()) return getMockBackend().lockTreasureScores(boardId, gameId, scores);
  const batch = writeBatch(db);
  for (const { uid, score } of scores) {
    batch.update(doc(db, "boards", boardId, "farmGames", gameId, "playerState", uid), {
      score,
      updatedAt: serverTimestamp(),
    });
  }
  await batch.commit();
}

/** Player submits a Treasure Power Action. Atomically deducts balance from their powerPoints doc. */
export async function submitTreasurePowerAction(
  boardId: string,
  gameId: string,
  uid: string,
  type: TreasurePowerActionType,
  db: Firestore = getFirebaseFirestore(),
): Promise<void> {
  if (isMockMode()) return getMockBackend().submitTreasurePowerAction(boardId, gameId, uid, type);
  const cost = TREASURE_POWER_ACTION_COSTS[type];
  const ppRef = powerPointsPath(boardId, gameId, uid, db);
  const paRef = powerActionPath(boardId, gameId, uid, db);
  await runTransaction(
    db,
    async (transaction) => {
      const ppSnap = await transaction.get(ppRef);
      const paSnap = await transaction.get(paRef);
      if (paSnap.exists()) throw new FarmError("already-resolved", "A Power Action was already submitted this round");
      const balance: number = ppSnap.exists() ? (ppSnap.data()?.balance ?? 0) : 0;
      if (balance < cost) throw new FarmError("not-active", "Insufficient Power Points");
      transaction.set(paRef, {
        type,
        cost,
        submittedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      transaction.update(ppRef, { balance: balance - cost, updatedAt: serverTimestamp() });
    },
    TRANSACTION_OPTIONS,
  );
}

export function subscribeToTreasurePowerActions(
  boardId: string,
  gameId: string,
  cb: (actions: TreasurePowerAction[]) => void,
  onError: (error: unknown) => void,
  db: Firestore = getFirebaseFirestore(),
): Unsubscribe {
  if (isMockMode()) return getMockBackend().subscribeToTreasurePowerActions(boardId, gameId, cb, onError);
  return onSnapshot(
    collection(db, "boards", boardId, "farmGames", gameId, "powerActions"),
    (snapshot) => {
      cb(
        snapshot.docs.flatMap((d) => {
          const action = toTreasurePowerAction(d.id, d.data({ serverTimestamps: "estimate" }));
          return action ? [action] : [];
        }),
      );
    },
    onError,
  );
}

/** Admin closes the settlement phase, writes the resolved state, and transitions to host_selection. */
export async function resolveAndTransitionTreasureToWheel(
  boardId: string,
  gameId: string,
  resolvedState: Omit<TreasureResolvedState, "resolvedAt">,
  db: Firestore = getFirebaseFirestore(),
): Promise<void> {
  if (isMockMode()) return getMockBackend().resolveAndTransitionTreasureToWheel(boardId, gameId, resolvedState);
  await updateDoc(doc(db, "boards", boardId, "farmGames", gameId), {
    status: "host_selection",
    resolvedState: { ...resolvedState, resolvedAt: serverTimestamp() },
    updatedAt: serverTimestamp(),
  });
}

/** Admin spins the Next Host Wheel during the Treasure Rush wheel phase. */
export async function spinTreasureHostWheel(
  boardId: string,
  gameId: string,
  winnerUid: string,
  db: Firestore = getFirebaseFirestore(),
): Promise<void> {
  if (isMockMode()) return getMockBackend().spinTreasureHostWheel(boardId, gameId, winnerUid);
  const batch = writeBatch(db);
  batch.update(doc(db, "boards", boardId, "farmGames", gameId), {
    status: "finished",
    resolution: "wheel",
    winnerUid,
    resolvedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  batch.update(doc(db, "boards", boardId), {
    nextHostUid: winnerUid,
    nextHostGameId: gameId,
    nextHostSpunAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await batch.commit();
}

/** Admin re-spins the host wheel (Lucky Re-roll). Increments reSpinCount before picking the new winner. */
export async function reSpinTreasureHostWheel(
  boardId: string,
  gameId: string,
  db: Firestore = getFirebaseFirestore(),
): Promise<number> {
  if (isMockMode()) return getMockBackend().reSpinTreasureHostWheel(boardId, gameId);
  const gameRef = doc(db, "boards", boardId, "farmGames", gameId);
  let newCount = 0;
  await runTransaction(
    db,
    async (transaction) => {
      const snap = await transaction.get(gameRef);
      const current: number = snap.data()?.reSpinCount ?? 0;
      if (current >= TREASURE_MAX_RESPINS) throw new FarmError("not-active", "Re-spin limit reached");
      newCount = current + 1;
      transaction.update(gameRef, { reSpinCount: newCount, updatedAt: serverTimestamp() });
    },
    TRANSACTION_OPTIONS,
  );
  return newCount;
}

// ---- Chaos Battle functions ----

const BATTLE_ITEM_TYPE_SET: ReadonlySet<string> = new Set([
  "magic-shield", "treasure-lock", "recovery-potion", "mirror-shield",
  "bomb-gift", "sneaky-thief", "ice-trap", "chaos-swap",
  "lucky-key", "treasure-radar", "golden-pick",
]);

const ATTACK_STATUS_SET: ReadonlySet<string> = new Set([
  "warning", "resolved", "blocked", "reflected", "cancelled",
]);

const BATTLE_FEED_EVENT_TYPE_SET: ReadonlySet<string> = new Set([
  "chest-opened", "bank", "attack-sent", "attack-resolved",
  "attack-blocked", "attack-reflected", "item-bought", "final-rush", "achievement",
]);

const REACTION_TYPE_SET: ReadonlySet<string> = new Set([
  "laugh", "shock", "fire", "clap", "skull", "heart",
]);

const INSTANT_BATTLE_ITEMS: ReadonlySet<BattleItemType> = new Set(["recovery-potion", "golden-pick"]);

function toAttackDocument(attackId: string, data: DocumentData): AttackDocument | null {
  const rawItemType = data.itemType;
  if (typeof rawItemType !== "string" || !BATTLE_ITEM_TYPE_SET.has(rawItemType)) return null;
  const rawStatus = data.status;
  const status: AttackStatus =
    typeof rawStatus === "string" && ATTACK_STATUS_SET.has(rawStatus)
      ? (rawStatus as AttackStatus) : "warning";
  return {
    id: attackId,
    attackerUid: typeof data.attackerUid === "string" ? data.attackerUid : "",
    targetUid: typeof data.targetUid === "string" ? data.targetUid : "",
    itemType: rawItemType as BattleItemType,
    status,
    tcDelta: typeof data.tcDelta === "number" ? data.tcDelta : 0,
    createdAt: toDate(data.createdAt),
    resolvedAt: toDate(data.resolvedAt),
  };
}

function toBattleFeedEvent(eventId: string, data: DocumentData): BattleFeedEvent | null {
  const rawType = data.type;
  if (typeof rawType !== "string" || !BATTLE_FEED_EVENT_TYPE_SET.has(rawType)) return null;
  const rawItemType = data.itemType;
  const itemType: BattleItemType | null =
    typeof rawItemType === "string" && BATTLE_ITEM_TYPE_SET.has(rawItemType)
      ? (rawItemType as BattleItemType) : null;
  return {
    id: eventId,
    type: rawType as BattleFeedEventType,
    actorUid: typeof data.actorUid === "string" ? data.actorUid : "",
    targetUid: typeof data.targetUid === "string" ? data.targetUid : null,
    itemType,
    tcDelta: typeof data.tcDelta === "number" ? data.tcDelta : null,
    createdAt: toDate(data.createdAt),
  };
}

function toReaction(reactionId: string, data: DocumentData): Reaction | null {
  const rawType = data.type;
  if (typeof rawType !== "string" || !REACTION_TYPE_SET.has(rawType)) return null;
  return {
    id: reactionId,
    uid: typeof data.uid === "string" ? data.uid : "",
    type: rawType as ReactionType,
    createdAt: toDate(data.createdAt),
  };
}

function toInventoryState(uid: string, data: DocumentData): InventoryState {
  const rawSlots = data.slots;
  const slots: InventorySlot[] = Array.isArray(rawSlots)
    ? (rawSlots as unknown[]).flatMap((s) => {
        if (typeof s !== "object" || s === null) return [];
        const itemType = (s as Record<string, unknown>).itemType;
        if (typeof itemType !== "string" || !BATTLE_ITEM_TYPE_SET.has(itemType)) return [];
        return [{ itemType: itemType as BattleItemType, boughtAt: toDate((s as Record<string, unknown>).boughtAt) }];
      })
    : [];
  return { uid, slots, updatedAt: toDate(data.updatedAt) };
}

/** Player buys a battle item. Instant items (recovery-potion, golden-pick) apply TC immediately without occupying a slot. */
export async function buyBattleItem(
  boardId: string,
  gameId: string,
  uid: string,
  itemType: BattleItemType,
  db: Firestore = getFirebaseFirestore(),
): Promise<void> {
  if (isMockMode()) return getMockBackend().buyBattleItem(boardId, gameId, uid, itemType);
  const cost = BATTLE_ITEM_COSTS[itemType];
  const gameRef = doc(db, "boards", boardId, "farmGames", gameId);
  const psRef = doc(db, "boards", boardId, "farmGames", gameId, "playerState", uid);
  const invRef = doc(db, "boards", boardId, "farmGames", gameId, "inventory", uid);
  const feedRef = doc(collection(db, "boards", boardId, "farmGames", gameId, "battleFeed"));
  await runTransaction(db, async (transaction) => {
    const [gameSnap, psSnap, invSnap] = await Promise.all([
      transaction.get(gameRef),
      transaction.get(psRef),
      transaction.get(invRef),
    ]);
    const gameData = gameSnap.data({ serverTimestamps: "estimate" });
    if (!gameSnap.exists() || gameData?.status !== "playing") throw new FarmError("not-active", "Game is not in playing state");
    const psData = psSnap.data() ?? {};
    const frozenUntilMs: number | null = typeof psData.frozenUntilMs === "number" ? psData.frozenUntilMs : null;
    if (frozenUntilMs !== null && frozenUntilMs > Timestamp.now().toMillis()) throw new FarmError("not-active", "Player is frozen");
    const currentRunPoints: number = typeof psData.currentRunPoints === "number" ? psData.currentRunPoints : 0;
    if (currentRunPoints < cost) throw new FarmError("not-active", "Insufficient TC");
    const isInstant = INSTANT_BATTLE_ITEMS.has(itemType);
    const invData = invSnap.data() ?? {};
    const slots: unknown[] = Array.isArray(invData.slots) ? (invData.slots as unknown[]) : [];
    if (!isInstant && slots.length >= 3) throw new FarmError("not-active", "Inventory is full");
    const tcSpentOnItems: number = typeof psData.tcSpentOnItems === "number" ? psData.tcSpentOnItems : 0;
    let newRunPoints = currentRunPoints - cost;
    if (itemType === "recovery-potion") newRunPoints += RECOVERY_POTION_RESTORE;
    if (itemType === "golden-pick") newRunPoints += GOLDEN_PICK_BONUS;
    const psUpdate: Record<string, unknown> = {
      currentRunPoints: Math.max(0, newRunPoints),
      tcSpentOnItems: tcSpentOnItems + cost,
      updatedAt: serverTimestamp(),
    };
    if (!isInstant) {
      const newSlots = [...slots, { itemType, boughtAt: serverTimestamp() }];
      transaction.set(invRef, { slots: newSlots, updatedAt: serverTimestamp() }, { merge: true });
    }
    if (psSnap.exists()) {
      transaction.update(psRef, psUpdate);
    } else {
      transaction.set(psRef, { openedCount: 0, bankedPoints: 0, gemBanked: 0, coinBanked: 0, crownBanked: 0, bankCount: 0, trapHit: false, maxSingleReward: 0, score: 0, lastActionAt: serverTimestamp(), currentRunGem: 0, currentRunCoin: 0, currentRunCrown: 0, attacksSent: 0, attacksBlocked: 0, tcLostToAttacks: 0, frozenUntilMs: null, ...psUpdate });
    }
    transaction.set(feedRef, { type: "item-bought", actorUid: uid, targetUid: null, itemType, tcDelta: -cost, createdAt: serverTimestamp() });
  }, TRANSACTION_OPTIONS);
}

/** Attacker uses an offensive item, creating an attack document with a 3-second warning window. Returns the attackId. */
export async function useOffensiveItem(
  boardId: string,
  gameId: string,
  attackerUid: string,
  targetUid: string,
  itemType: BattleItemType,
  db: Firestore = getFirebaseFirestore(),
): Promise<string> {
  if (isMockMode()) return getMockBackend().useOffensiveItem(boardId, gameId, attackerUid, targetUid, itemType);
  const gameRef = doc(db, "boards", boardId, "farmGames", gameId);
  const psRef = doc(db, "boards", boardId, "farmGames", gameId, "playerState", attackerUid);
  const invRef = doc(db, "boards", boardId, "farmGames", gameId, "inventory", attackerUid);
  const attackRef = doc(collection(db, "boards", boardId, "farmGames", gameId, "attacks"));
  const feedRef = doc(collection(db, "boards", boardId, "farmGames", gameId, "battleFeed"));
  const attackId = attackRef.id;
  await runTransaction(db, async (transaction) => {
    const [gameSnap, psSnap, invSnap] = await Promise.all([
      transaction.get(gameRef),
      transaction.get(psRef),
      transaction.get(invRef),
    ]);
    const gameData = gameSnap.data({ serverTimestamps: "estimate" });
    if (!gameSnap.exists() || gameData?.status !== "playing") throw new FarmError("not-active", "Game is not in playing state");
    const endsAt: unknown = gameData.endsAt;
    if (endsAt instanceof Timestamp && endsAt.toMillis() - Timestamp.now().toMillis() <= FINAL_RUSH_ATTACK_SHUTDOWN_MS) {
      throw new FarmError("not-active", "Attacks shut down in final 5 seconds");
    }
    const psData = psSnap.data() ?? {};
    const frozenUntilMs: number | null = typeof psData.frozenUntilMs === "number" ? psData.frozenUntilMs : null;
    if (frozenUntilMs !== null && frozenUntilMs > Timestamp.now().toMillis()) throw new FarmError("not-active", "Player is frozen");
    const invData = invSnap.data() ?? {};
    const slots: unknown[] = Array.isArray(invData.slots) ? (invData.slots as unknown[]) : [];
    const itemIdx = slots.findIndex((s) => typeof s === "object" && s !== null && (s as Record<string, unknown>).itemType === itemType);
    if (itemIdx === -1) throw new FarmError("not-active", "Item not in inventory");
    const newSlots = slots.filter((_, i) => i !== itemIdx);
    const attacksSent: number = typeof psData.attacksSent === "number" ? psData.attacksSent : 0;
    transaction.set(attackRef, { attackerUid, targetUid, itemType, status: "warning", tcDelta: 0, createdAt: serverTimestamp(), resolvedAt: null });
    transaction.set(invRef, { slots: newSlots, updatedAt: serverTimestamp() }, { merge: true });
    if (psSnap.exists()) {
      transaction.update(psRef, { attacksSent: attacksSent + 1, updatedAt: serverTimestamp() });
    }
    transaction.set(feedRef, { type: "attack-sent", actorUid: attackerUid, targetUid, itemType, tcDelta: null, createdAt: serverTimestamp() });
  }, TRANSACTION_OPTIONS);
  return attackId;
}

/** Attacker calls this after ATTACK_WARNING_MS ms to apply the attack effect to the target. */
export async function resolveAttack(
  boardId: string,
  gameId: string,
  attackId: string,
  db: Firestore = getFirebaseFirestore(),
): Promise<void> {
  if (isMockMode()) return getMockBackend().resolveAttack(boardId, gameId, attackId);
  const attackRef = doc(db, "boards", boardId, "farmGames", gameId, "attacks", attackId);
  const feedRef = doc(collection(db, "boards", boardId, "farmGames", gameId, "battleFeed"));
  await runTransaction(db, async (transaction) => {
    const attackSnap = await transaction.get(attackRef);
    if (!attackSnap.exists()) throw new FarmError("not-active", "Attack not found");
    const attackData = attackSnap.data() ?? {};
    if (attackData.status !== "warning") throw new FarmError("already-resolved", "Attack already resolved");
    const createdAtTs = attackData.createdAt;
    if (createdAtTs instanceof Timestamp && Timestamp.now().toMillis() < createdAtTs.toMillis() + ATTACK_WARNING_MS) {
      throw new FarmError("not-active", "Warning window still open");
    }
    const { attackerUid, targetUid, itemType } = attackData as { attackerUid: string; targetUid: string; itemType: BattleItemType };
    const targetPsRef = doc(db, "boards", boardId, "farmGames", gameId, "playerState", targetUid);
    const attackerPsRef = doc(db, "boards", boardId, "farmGames", gameId, "playerState", attackerUid);
    const [targetPsSnap, attackerPsSnap] = await Promise.all([transaction.get(targetPsRef), transaction.get(attackerPsRef)]);
    const targetData = targetPsSnap.data() ?? {};
    const attackerData = attackerPsSnap.data() ?? {};
    const targetRunPts: number = typeof targetData.currentRunPoints === "number" ? targetData.currentRunPoints : 0;
    const attackerRunPts: number = typeof attackerData.currentRunPoints === "number" ? attackerData.currentRunPoints : 0;
    let tcDelta = 0;
    const targetUpdate: Record<string, unknown> = { updatedAt: serverTimestamp() };
    const attackerUpdate: Record<string, unknown> = { updatedAt: serverTimestamp() };
    let applyAttackerUpdate = false;
    if (itemType === "bomb-gift") {
      tcDelta = -Math.min(targetRunPts, BOMB_GIFT_DAMAGE);
      targetUpdate.currentRunPoints = Math.max(0, targetRunPts + tcDelta);
      targetUpdate.tcLostToAttacks = (typeof targetData.tcLostToAttacks === "number" ? targetData.tcLostToAttacks : 0) + Math.abs(tcDelta);
    } else if (itemType === "sneaky-thief") {
      const steal = Math.min(targetRunPts, SNEAKY_THIEF_MAX_STEAL);
      tcDelta = -steal;
      targetUpdate.currentRunPoints = Math.max(0, targetRunPts - steal);
      targetUpdate.tcLostToAttacks = (typeof targetData.tcLostToAttacks === "number" ? targetData.tcLostToAttacks : 0) + steal;
      attackerUpdate.currentRunPoints = attackerRunPts + steal;
      applyAttackerUpdate = true;
    } else if (itemType === "ice-trap") {
      tcDelta = 0;
      targetUpdate.frozenUntilMs = Timestamp.now().toMillis() + ICE_TRAP_DURATION_MS;
    } else if (itemType === "chaos-swap") {
      tcDelta = targetRunPts - attackerRunPts;
      targetUpdate.currentRunPoints = attackerRunPts;
      attackerUpdate.currentRunPoints = targetRunPts;
      applyAttackerUpdate = true;
    }
    transaction.update(attackRef, { status: "resolved", tcDelta, resolvedAt: serverTimestamp() });
    if (targetPsSnap.exists()) {
      transaction.update(targetPsRef, targetUpdate);
    } else {
      transaction.set(targetPsRef, { openedCount: 0, currentRunPoints: 0, bankedPoints: 0, gemBanked: 0, coinBanked: 0, crownBanked: 0, bankCount: 0, trapHit: false, maxSingleReward: 0, score: 0, currentRunGem: 0, currentRunCoin: 0, currentRunCrown: 0, lastActionAt: serverTimestamp(), ...targetUpdate });
    }
    if (applyAttackerUpdate) {
      if (attackerPsSnap.exists()) {
        transaction.update(attackerPsRef, attackerUpdate);
      } else {
        transaction.set(attackerPsRef, { openedCount: 0, currentRunPoints: 0, bankedPoints: 0, gemBanked: 0, coinBanked: 0, crownBanked: 0, bankCount: 0, trapHit: false, maxSingleReward: 0, score: 0, currentRunGem: 0, currentRunCoin: 0, currentRunCrown: 0, lastActionAt: serverTimestamp(), ...attackerUpdate });
      }
    }
    transaction.set(feedRef, { type: "attack-resolved", actorUid: attackerUid, targetUid, itemType, tcDelta, createdAt: serverTimestamp() });
  }, TRANSACTION_OPTIONS);
}

/** Target uses a defensive item during the warning window to block or reflect an incoming attack. */
export async function useDefensiveItemAgainstAttack(
  boardId: string,
  gameId: string,
  uid: string,
  attackId: string,
  defenseItemType: BattleItemType,
  db: Firestore = getFirebaseFirestore(),
): Promise<void> {
  if (isMockMode()) return getMockBackend().useDefensiveItemAgainstAttack(boardId, gameId, uid, attackId, defenseItemType);
  const attackRef = doc(db, "boards", boardId, "farmGames", gameId, "attacks", attackId);
  const invRef = doc(db, "boards", boardId, "farmGames", gameId, "inventory", uid);
  const psRef = doc(db, "boards", boardId, "farmGames", gameId, "playerState", uid);
  const feedRef = doc(collection(db, "boards", boardId, "farmGames", gameId, "battleFeed"));
  await runTransaction(db, async (transaction) => {
    const [attackSnap, invSnap, psSnap] = await Promise.all([
      transaction.get(attackRef),
      transaction.get(invRef),
      transaction.get(psRef),
    ]);
    if (!attackSnap.exists()) throw new FarmError("not-active", "Attack not found");
    const attackData = attackSnap.data() ?? {};
    if (attackData.status !== "warning") throw new FarmError("already-resolved", "Warning window closed");
    if (attackData.targetUid !== uid) throw new FarmError("not-active", "Not the attack target");
    const invData = invSnap.data() ?? {};
    const slots: unknown[] = Array.isArray(invData.slots) ? (invData.slots as unknown[]) : [];
    const itemIdx = slots.findIndex((s) => typeof s === "object" && s !== null && (s as Record<string, unknown>).itemType === defenseItemType);
    if (itemIdx === -1) throw new FarmError("not-active", "Defense item not in inventory");
    const newSlots = slots.filter((_, i) => i !== itemIdx);
    const psData = psSnap.data() ?? {};
    const attacksBlocked: number = typeof psData.attacksBlocked === "number" ? psData.attacksBlocked : 0;
    const isReflect = defenseItemType === "mirror-shield";
    const newStatus: AttackStatus = isReflect ? "reflected" : "blocked";
    const feedType: BattleFeedEventType = isReflect ? "attack-reflected" : "attack-blocked";
    transaction.update(attackRef, { status: newStatus, resolvedAt: serverTimestamp() });
    transaction.set(invRef, { slots: newSlots, updatedAt: serverTimestamp() }, { merge: true });
    transaction.update(psRef, { attacksBlocked: attacksBlocked + 1, updatedAt: serverTimestamp() });
    transaction.set(feedRef, { type: feedType, actorUid: uid, targetUid: attackData.attackerUid as string, itemType: defenseItemType, tcDelta: null, createdAt: serverTimestamp() });
    if (isReflect) {
      const attackerUid = attackData.attackerUid as string;
      const incomingItemType = attackData.itemType as BattleItemType;
      const attackerPsRef = doc(db, "boards", boardId, "farmGames", gameId, "playerState", attackerUid);
      const attackerPsSnap = await transaction.get(attackerPsRef);
      const attackerData = attackerPsSnap.data() ?? {};
      const attackerRunPts: number = typeof attackerData.currentRunPoints === "number" ? attackerData.currentRunPoints : 0;
      const reflectUpdate: Record<string, unknown> = { updatedAt: serverTimestamp() };
      if (incomingItemType === "bomb-gift") {
        const dmg = Math.min(attackerRunPts, BOMB_GIFT_DAMAGE);
        reflectUpdate.currentRunPoints = Math.max(0, attackerRunPts - dmg);
        reflectUpdate.tcLostToAttacks = (typeof attackerData.tcLostToAttacks === "number" ? attackerData.tcLostToAttacks : 0) + dmg;
      } else if (incomingItemType === "sneaky-thief") {
        const steal = Math.min(attackerRunPts, SNEAKY_THIEF_MAX_STEAL);
        reflectUpdate.currentRunPoints = Math.max(0, attackerRunPts - steal);
        reflectUpdate.tcLostToAttacks = (typeof attackerData.tcLostToAttacks === "number" ? attackerData.tcLostToAttacks : 0) + steal;
      } else if (incomingItemType === "ice-trap") {
        reflectUpdate.frozenUntilMs = Timestamp.now().toMillis() + ICE_TRAP_DURATION_MS;
      }
      if (attackerPsSnap.exists()) {
        transaction.update(attackerPsRef, reflectUpdate);
      } else {
        transaction.set(attackerPsRef, { openedCount: 0, currentRunPoints: 0, bankedPoints: 0, gemBanked: 0, coinBanked: 0, crownBanked: 0, bankCount: 0, trapHit: false, maxSingleReward: 0, score: 0, currentRunGem: 0, currentRunCoin: 0, currentRunCrown: 0, lastActionAt: serverTimestamp(), ...reflectUpdate });
      }
    }
  }, TRANSACTION_OPTIONS);
}

/** Player sends an emoji reaction. Rate limiting is enforced by Firestore Rules. */
export async function sendReaction(
  boardId: string,
  gameId: string,
  uid: string,
  type: ReactionType,
  db: Firestore = getFirebaseFirestore(),
): Promise<void> {
  if (isMockMode()) return getMockBackend().sendReaction(boardId, gameId, uid, type);
  const reactionRef = doc(collection(db, "boards", boardId, "farmGames", gameId, "reactions"));
  await setDoc(reactionRef, { uid, type, createdAt: serverTimestamp() });
}

/** Admin locks the settlement phase: writes scores, achievements, resolved state, and transitions to host_selection. */
export async function lockSettlement(
  boardId: string,
  gameId: string,
  achievements: AchievementResult[],
  scores: { uid: string; score: number }[],
  resolvedState: Omit<TreasureResolvedState, "resolvedAt">,
  db: Firestore = getFirebaseFirestore(),
): Promise<void> {
  if (isMockMode()) return getMockBackend().lockSettlement(boardId, gameId, achievements, scores, resolvedState);
  const batch = writeBatch(db);
  batch.update(doc(db, "boards", boardId, "farmGames", gameId), {
    status: "host_selection",
    achievements,
    resolvedState: { ...resolvedState, resolvedAt: serverTimestamp() },
    updatedAt: serverTimestamp(),
  });
  for (const { uid, score } of scores) {
    batch.update(doc(db, "boards", boardId, "farmGames", gameId, "playerState", uid), {
      score,
      updatedAt: serverTimestamp(),
    });
  }
  await batch.commit();
}

export function subscribeToInventory(
  boardId: string,
  gameId: string,
  uid: string,
  cb: (inventory: InventoryState | null) => void,
  onError: (error: unknown) => void,
  db: Firestore = getFirebaseFirestore(),
): Unsubscribe {
  if (isMockMode()) return getMockBackend().subscribeToInventory(boardId, gameId, uid, cb, onError);
  return onSnapshot(
    doc(db, "boards", boardId, "farmGames", gameId, "inventory", uid),
    (snapshot) => {
      const data = snapshot.data({ serverTimestamps: "estimate" });
      cb(snapshot.exists() && data ? toInventoryState(snapshot.id, data) : null);
    },
    onError,
  );
}

export function subscribeToAttacks(
  boardId: string,
  gameId: string,
  cb: (attacks: AttackDocument[]) => void,
  onError: (error: unknown) => void,
  db: Firestore = getFirebaseFirestore(),
): Unsubscribe {
  if (isMockMode()) return getMockBackend().subscribeToAttacks(boardId, gameId, cb, onError);
  return onSnapshot(
    collection(db, "boards", boardId, "farmGames", gameId, "attacks"),
    (snapshot) => {
      cb(snapshot.docs.flatMap((d) => {
        const attack = toAttackDocument(d.id, d.data({ serverTimestamps: "estimate" }));
        return attack ? [attack] : [];
      }));
    },
    onError,
  );
}

export function subscribeToBattleFeed(
  boardId: string,
  gameId: string,
  cb: (events: BattleFeedEvent[]) => void,
  onError: (error: unknown) => void,
  db: Firestore = getFirebaseFirestore(),
): Unsubscribe {
  if (isMockMode()) return getMockBackend().subscribeToBattleFeed(boardId, gameId, cb, onError);
  return onSnapshot(
    collection(db, "boards", boardId, "farmGames", gameId, "battleFeed"),
    (snapshot) => {
      cb(snapshot.docs.flatMap((d) => {
        const event = toBattleFeedEvent(d.id, d.data({ serverTimestamps: "estimate" }));
        return event ? [event] : [];
      }));
    },
    onError,
  );
}

export function subscribeToReactions(
  boardId: string,
  gameId: string,
  cb: (reactions: Reaction[]) => void,
  onError: (error: unknown) => void,
  db: Firestore = getFirebaseFirestore(),
): Unsubscribe {
  if (isMockMode()) return getMockBackend().subscribeToReactions(boardId, gameId, cb, onError);
  return onSnapshot(
    collection(db, "boards", boardId, "farmGames", gameId, "reactions"),
    (snapshot) => {
      cb(snapshot.docs.flatMap((d) => {
        const reaction = toReaction(d.id, d.data({ serverTimestamps: "estimate" }));
        return reaction ? [reaction] : [];
      }));
    },
    onError,
  );
}

/**
 * Hands the Host role to the stored next Host (D163): the old Host moves to `pastHostUids` and the next Host becomes
 * `hostUid`, in one write. Nobody becomes a previous Host just by being selected; only this call makes the change.
 */
export async function handOverHost(boardId: string, db: Firestore = getFirebaseFirestore()): Promise<void> {
  if (isMockMode()) return getMockBackend().handOverHost(boardId);
  const boardRef = doc(db, "boards", boardId);
  await runTransaction(
    db,
    async (transaction) => {
      const board = (await transaction.get(boardRef)).data();
      if (!isBoardOpenForFarm(board)) throw new FarmError("not-active", "The board is not in step 5");
      const nextHostUid: unknown = board.nextHostUid;
      const activeGameId: unknown = board.farmActiveGameId;
      if (typeof nextHostUid !== "string" || (typeof activeGameId === "string" && board.nextHostGameId !== activeGameId)) {
        throw new FarmError("no-next-host", "There is no stored next Host to hand over to");
      }
      if (isExcludedHost(board, nextHostUid)) throw new FarmError("host-excluded", "This person already is or was the Host");
      const past: unknown = board.pastHostUids;
      const pastHostUids = Array.isArray(past) ? past.filter((entry): entry is string => typeof entry === "string") : [];
      const currentHostUid = typeof board.hostUid === "string" ? board.hostUid : String(board.ownerId);
      transaction.update(boardRef, {
        hostUid: nextHostUid,
        pastHostUids: [...pastHostUids, currentHostUid],
        updatedAt: serverTimestamp(),
      });
    },
    TRANSACTION_OPTIONS,
  );
}
