import {
  Timestamp,
  collection,
  doc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  setDoc,
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
