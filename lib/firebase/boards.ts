import type { User } from "firebase/auth";
import {
  collection,
  collectionGroup,
  doc,
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
  type Timestamp,
  type Unsubscribe,
} from "firebase/firestore";
import { getFirebaseFirestore } from "./client";
import { type Board, type BoardMember, type BoardRole, type DashboardBoard } from "./types";

function toDate(value: unknown): Date | null {
  return value && typeof (value as Timestamp).toDate === "function"
    ? (value as Timestamp).toDate()
    : null;
}

function toMember(data: DocumentData): BoardMember {
  return { uid: data.uid, role: data.role, displayName: data.displayName };
}

export async function createBoard(
  user: User,
  title: string,
  playerName: string,
  db: Firestore = getFirebaseFirestore(),
): Promise<string> {
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
  await updateDoc(doc(db, "boards", boardId), {
    status: "in-progress",
    startedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function completeSession(
  boardId: string,
  db: Firestore = getFirebaseFirestore(),
): Promise<void> {
  await updateDoc(doc(db, "boards", boardId), {
    status: "completed",
    completedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function joinBoard(
  boardId: string,
  user: User,
  playerName: string,
  db: Firestore = getFirebaseFirestore(),
): Promise<void> {
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
  return onSnapshot(
    query(
      collection(db, "boards", boardId, "members"),
      orderBy("joinedAt"),
    ),
    (snapshot) => onMembers(snapshot.docs.map((memberDoc) => toMember(memberDoc.data()))),
    onError,
  );
}

export function subscribeToMemberships(
  uid: string,
  onBoards: (boards: DashboardBoard[]) => void,
  onError: (error: unknown) => void,
  db: Firestore = getFirebaseFirestore(),
): Unsubscribe {
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
