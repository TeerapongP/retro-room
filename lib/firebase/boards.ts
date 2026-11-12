import type { User } from "firebase/auth";
import {
  Timestamp,
  collection,
  collectionGroup,
  deleteField,
  doc,
  getDocs,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
  type Firestore,
  type Unsubscribe,
} from "firebase/firestore";
import { getMockBackend, isMockMode } from "../mock";
import { clampPhase } from "../phases";
import { getFirebaseFirestore } from "./client";
import { type Board, type BoardMember, type BoardRole, type DashboardBoard } from "./types";

function toDate(value: unknown): Date | null {
  return value && typeof (value as Timestamp).toDate === "function"
    ? (value as Timestamp).toDate()
    : null;
}

function toMember(data: DocumentData): BoardMember {
  return { uid: data.uid, role: data.role, displayName: data.displayName, joinedAt: toDate(data.joinedAt) };
}

export async function createBoard(
  user: User,
  title: string,
  playerName: string,
  db: Firestore = getFirebaseFirestore(),
): Promise<string> {
  if (isMockMode()) return getMockBackend().createBoard(user.uid, title, playerName);
  const boardRef = doc(collection(db, "boards"));
  const batch = writeBatch(db);
  batch.set(boardRef, {
    title,
    ownerId: user.uid,
    status: "waiting",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  batch.set(doc(db, "boards", boardRef.id, "members", user.uid), {
    uid: user.uid,
    role: "owner",
    displayName: playerName,
    joinedAt: serverTimestamp(),
  });
  await batch.commit();
  return boardRef.id;
}

export async function startSession(
  boardId: string,
  db: Firestore = getFirebaseFirestore(),
): Promise<void> {
  if (isMockMode()) return getMockBackend().startSession(boardId);
  await updateDoc(doc(db, "boards", boardId), {
    status: "in-progress",
    startedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

/** Admin only (D110, D112): starts the shared countdown. Rules reject anyone else, a past end time and more than 2 hours. */
export async function startTimer(
  boardId: string,
  minutes: number,
  db: Firestore = getFirebaseFirestore(),
): Promise<void> {
  if (isMockMode()) return getMockBackend().startTimer(boardId, minutes);
  await updateDoc(doc(db, "boards", boardId), {
    timerEndsAt: Timestamp.fromMillis(Date.now() + minutes * 60_000),
    timerDurationSec: Math.round(minutes * 60),
    updatedAt: serverTimestamp(),
  });
}

/** Admin only (D117, D121): moves the shared session step (1 to 6). Rules reject anyone else. */
export async function setPhase(
  boardId: string,
  phase: number,
  db: Firestore = getFirebaseFirestore(),
): Promise<void> {
  if (isMockMode()) return getMockBackend().setPhase(boardId, phase);
  await updateDoc(doc(db, "boards", boardId), { phase, updatedAt: serverTimestamp() });
}

/** Admin only (F29, D149): stores the wheel result. Rules allow it only in step 5 and only for a member of the board. */
export async function spinNextHost(
  boardId: string,
  winnerUid: string,
  db: Firestore = getFirebaseFirestore(),
): Promise<void> {
  if (isMockMode()) return getMockBackend().spinNextHost(boardId, winnerUid);
  await updateDoc(doc(db, "boards", boardId), {
    nextHostUid: winnerUid,
    nextHostSpunAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

/** Admin only: stops the countdown. */
export async function stopTimer(boardId: string, db: Firestore = getFirebaseFirestore()): Promise<void> {
  if (isMockMode()) return getMockBackend().stopTimer(boardId);
  await updateDoc(doc(db, "boards", boardId), {
    timerEndsAt: null,
    timerDurationSec: null,
    updatedAt: serverTimestamp(),
  });
}

export async function completeSession(
  boardId: string,
  db: Firestore = getFirebaseFirestore(),
): Promise<void> {
  if (isMockMode()) return getMockBackend().completeSession(boardId);
  await updateDoc(doc(db, "boards", boardId), {
    status: "completed",
    completedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function resetBoard(
  boardId: string,
  db: Firestore = getFirebaseFirestore(),
): Promise<void> {
  if (isMockMode()) return getMockBackend().resetBoard(boardId);
  await updateDoc(doc(db, "boards", boardId), {
    status: "waiting",
    updatedAt: serverTimestamp(),
    completedAt: deleteField(),
    startedAt: deleteField(),
    phase: deleteField(),
    timerEndsAt: deleteField(),
    timerDurationSec: deleteField(),
    nextHostUid: deleteField(),
    nextHostSpunAt: deleteField(),
    farmActiveGameId: deleteField(),
    nextHostGameId: deleteField(),
    hostUid: deleteField(),
    pastHostUids: deleteField(),
  });
}

export async function clearBoard(
  boardId: string,
  db: Firestore = getFirebaseFirestore(),
): Promise<void> {
  if (isMockMode()) return getMockBackend().clearBoard(boardId);
  const [cardsSnap, votersSnap, ratingsSnap] = await Promise.all([
    getDocs(collection(db, "boards", boardId, "cards")),
    getDocs(collection(db, "boards", boardId, "voters")),
    getDocs(collection(db, "boards", boardId, "ratings")),
  ]);
  const batch = writeBatch(db);
  for (const d of [...cardsSnap.docs, ...votersSnap.docs, ...ratingsSnap.docs]) {
    batch.delete(d.ref);
  }
  batch.update(doc(db, "boards", boardId), { phase: 1, updatedAt: serverTimestamp() });
  await batch.commit();
}

export async function joinBoard(
  boardId: string,
  user: User,
  playerName: string,
  db: Firestore = getFirebaseFirestore(),
): Promise<void> {
  if (isMockMode()) return getMockBackend().joinBoard(boardId, user.uid, playerName);
  await setDoc(doc(db, "boards", boardId, "members", user.uid), {
    uid: user.uid,
    role: "member",
    displayName: playerName,
    joinedAt: serverTimestamp(),
  });
}

export async function getOwnMembership(
  boardId: string,
  uid: string,
  db: Firestore = getFirebaseFirestore(),
): Promise<BoardMember | null> {
  if (isMockMode()) return getMockBackend().getOwnMembership(boardId, uid);
  const snapshot = await getDoc(doc(db, "boards", boardId, "members", uid));
  const data = snapshot.data();
  return snapshot.exists() && data ? toMember(data) : null;
}

export function subscribeToBoard(
  boardId: string,
  onBoard: (board: Board | null) => void,
  onError: (error: unknown) => void,
  db: Firestore = getFirebaseFirestore(),
): Unsubscribe {
  if (isMockMode()) return getMockBackend().subscribeToBoard(boardId, onBoard, onError);
  return onSnapshot(
    doc(db, "boards", boardId),
    (snapshot) => {
      const data = snapshot.data();
      onBoard(
        snapshot.exists() && data
          ? {
              id: snapshot.id,
              title: data.title,
              ownerId: data.ownerId,
              status: data.status ?? "in-progress",
              timerEndsAt: toDate(data.timerEndsAt),
              timerDurationSec: typeof data.timerDurationSec === "number" ? data.timerDurationSec : null,
              phase: clampPhase(data.phase),
              nextHostUid: typeof data.nextHostUid === "string" ? data.nextHostUid : null,
              nextHostSpunAt: toDate(data.nextHostSpunAt),
              farmActiveGameId: typeof data.farmActiveGameId === "string" ? data.farmActiveGameId : null,
              nextHostGameId: typeof data.nextHostGameId === "string" ? data.nextHostGameId : null,
              hostUid: typeof data.hostUid === "string" ? data.hostUid : null,
              pastHostUids: Array.isArray(data.pastHostUids)
                ? data.pastHostUids.filter((entry: unknown): entry is string => typeof entry === "string")
                : [],
            }
          : null,
      );
    },
    onError,
  );
}

export function subscribeToMembers(
  boardId: string,
  onMembers: (members: BoardMember[]) => void,
  onError: (error: unknown) => void,
  db: Firestore = getFirebaseFirestore(),
): Unsubscribe {
  if (isMockMode()) return getMockBackend().subscribeToMembers(boardId, onMembers, onError);
  return onSnapshot(
    query(
      collection(db, "boards", boardId, "members"),
      orderBy("joinedAt"),
    ),
    (snapshot) => onMembers(snapshot.docs.map((memberDoc) => toMember(memberDoc.data({ serverTimestamps: "estimate" })))),
    onError,
  );
}

export function subscribeToMemberships(
  uid: string,
  onBoards: (boards: DashboardBoard[]) => void,
  onError: (error: unknown) => void,
  db: Firestore = getFirebaseFirestore(),
): Unsubscribe {
  if (isMockMode()) return getMockBackend().subscribeToMemberships(uid, onBoards, onError);
  let latestRequest = 0;
  return onSnapshot(
    query(collectionGroup(db, "members"), where("uid", "==", uid)),
    async (snapshot) => {
      const request = ++latestRequest;
      const results = await Promise.allSettled(
        snapshot.docs.map(async (memberDoc): Promise<DashboardBoard | null> => {
          const boardRef = memberDoc.ref.parent.parent;
          if (!boardRef) return null;
          const boardSnapshot = await getDoc(boardRef);
          if (!boardSnapshot.exists()) return null;
          return {
            boardId: boardRef.id,
            title: boardSnapshot.data().title,
            role: memberDoc.data().role as BoardRole,
            joinedAt: toDate(memberDoc.data({ serverTimestamps: "estimate" }).joinedAt),
          };
        }),
      );
      if (request !== latestRequest) return;
      const boards = results
        .flatMap((result) => (result.status === "fulfilled" && result.value ? [result.value] : []))
        .sort((a, b) => (b.joinedAt?.getTime() ?? 0) - (a.joinedAt?.getTime() ?? 0));
      onBoards(boards);
    },
    onError,
  );
}
