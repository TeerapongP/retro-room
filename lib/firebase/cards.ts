import type { User } from "firebase/auth";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  type Firestore,
  type Timestamp,
  type Unsubscribe,
} from "firebase/firestore";
import { getFirebaseFirestore } from "./client";
import type { BoardCard, ColumnId } from "./types";

export function subscribeToCards(
  boardId: string,
  onCards: (cards: BoardCard[]) => void,
  onError: (error: unknown) => void,
  db: Firestore = getFirebaseFirestore(),
): Unsubscribe {
  return onSnapshot(
    query(
      collection(db, "boards", boardId, "cards"),
      orderBy("createdAt"),
    ),
    (snapshot) =>
      onCards(
        snapshot.docs.map((cardDoc) => {
          const data = cardDoc.data({ serverTimestamps: "estimate" });
          return {
            id: cardDoc.id,
            columnId: data.columnId,
            text: data.text,
            authorId: data.authorId,
            createdAt: (data.createdAt as Timestamp | undefined)?.toDate() ?? null,
          };
        }),
      ),
    onError,
  );
}

export async function addCard(
  boardId: string,
  user: User,
  columnId: ColumnId,
  text: string,
  db: Firestore = getFirebaseFirestore(),
): Promise<void> {
  await addDoc(collection(db, "boards", boardId, "cards"), {
    columnId,
    text,
    authorId: user.uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function editCard(
  boardId: string,
  cardId: string,
  text: string,
  db: Firestore = getFirebaseFirestore(),
): Promise<void> {
  await updateDoc(doc(db, "boards", boardId, "cards", cardId), {
    text,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteCard(
  boardId: string,
  cardId: string,
  db: Firestore = getFirebaseFirestore(),
): Promise<void> {
  await deleteDoc(doc(db, "boards", boardId, "cards", cardId));
}
