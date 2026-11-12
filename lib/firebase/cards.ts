import type { User } from "firebase/auth";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
  type Firestore,
  type QueryDocumentSnapshot,
  type Timestamp,
  type Unsubscribe,
} from "firebase/firestore";
import { getMockBackend, isMockMode } from "../mock";
import { getFirebaseFirestore } from "./client";
import type { BoardCard, ColumnId, MoveTargetBoard } from "./types";

export type CardViewer = { uid: string; isAdmin: boolean };

function toBoardCard(cardDoc: QueryDocumentSnapshot): BoardCard {
  const data = cardDoc.data({ serverTimestamps: "estimate" });
  return {
    id: cardDoc.id,
    columnId: data.columnId,
    text: data.text,
    authorId: data.authorId,
    hidden: data.hidden === true,
    groupId: typeof data.groupId === "string" ? data.groupId : null,
    createdAt: (data.createdAt as Timestamp | undefined)?.toDate() ?? null,
  };
}

function byCreatedAt(first: BoardCard, second: BoardCard): number {
  const difference = (first.createdAt?.getTime() ?? 0) - (second.createdAt?.getTime() ?? 0);
  return difference !== 0 ? difference : first.id.localeCompare(second.id);
}

/**
 * Firestore Rules are not filters (D76). The admin reads everything with one query. Anyone else
 * needs queries the Rules can prove safe: their own cards, and all non-hidden cards. Results are
 * merged here. No orderBy is used so no composite index is needed.
 */
export function subscribeToCards(
  boardId: string,
  viewer: CardViewer,
  onCards: (cards: BoardCard[]) => void,
  onError: (error: unknown) => void,
  db: Firestore = getFirebaseFirestore(),
): Unsubscribe {
  if (isMockMode()) return getMockBackend().subscribeToCards(boardId, viewer, onCards, onError);
  const cardsCollection = collection(db, "boards", boardId, "cards");

  if (viewer.isAdmin) {
    return onSnapshot(
      query(cardsCollection, orderBy("createdAt")),
      (snapshot) => onCards(snapshot.docs.map(toBoardCard)),
      onError,
    );
  }

  let visibleCards: BoardCard[] | null = null;
  let ownCards: BoardCard[] | null = null;
  const publish = () => {
    if (visibleCards === null || ownCards === null) return;
    const merged = new Map<string, BoardCard>();
    for (const card of [...visibleCards, ...ownCards]) merged.set(card.id, card);
    onCards([...merged.values()].sort(byCreatedAt));
  };

  const stopVisible = onSnapshot(
    query(cardsCollection, where("hidden", "==", false)),
    (snapshot) => {
      visibleCards = snapshot.docs.map(toBoardCard);
      publish();
    },
    onError,
  );
  const stopOwn = onSnapshot(
    query(cardsCollection, where("authorId", "==", viewer.uid)),
    (snapshot) => {
      ownCards = snapshot.docs.map(toBoardCard);
      publish();
    },
    onError,
  );
  return () => {
    stopVisible();
    stopOwn();
  };
}

export async function addCard(
  boardId: string,
  user: User,
  columnId: ColumnId,
  text: string,
  db: Firestore = getFirebaseFirestore(),
): Promise<void> {
  if (isMockMode()) return getMockBackend().addCard(boardId, user.uid, columnId, text);
  await addDoc(collection(db, "boards", boardId, "cards"), {
    columnId,
    text,
    authorId: user.uid,
    hidden: false,
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
  if (isMockMode()) return getMockBackend().editCard(boardId, cardId, text);
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
  if (isMockMode()) return getMockBackend().deleteCard(boardId, cardId);
  await deleteDoc(doc(db, "boards", boardId, "cards", cardId));
}

/** Admin only (D75). Rules reject anyone else. */
export async function setCardHidden(
  boardId: string,
  cardId: string,
  hidden: boolean,
  db: Firestore = getFirebaseFirestore(),
): Promise<void> {
  if (isMockMode()) return getMockBackend().setCardHidden(boardId, cardId, hidden);
  await updateDoc(doc(db, "boards", boardId, "cards", cardId), {
    hidden,
    updatedAt: serverTimestamp(),
  });
}

/** Admin only (D101): moves a card to another column of the same board. Rules reject anyone else. */
export async function setCardColumn(
  boardId: string,
  cardId: string,
  columnId: ColumnId,
  db: Firestore = getFirebaseFirestore(),
): Promise<void> {
  if (isMockMode()) return getMockBackend().setCardColumn(boardId, cardId, columnId);
  await updateDoc(doc(db, "boards", boardId, "cards", cardId), {
    columnId,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Admin only (D102 to D104): puts `dragged` on the stack of `target`, in the target's column. The stack label is the
 * target's groupId, or the target's id when it had none (then the target is updated too). One batch.
 */
export async function stackCards(
  boardId: string,
  dragged: BoardCard,
  target: BoardCard,
  db: Firestore = getFirebaseFirestore(),
): Promise<void> {
  if (dragged.id === target.id) return;
  const groupId = target.groupId ?? target.id;
  if (dragged.groupId === groupId && dragged.columnId === target.columnId) return;
  if (isMockMode()) return getMockBackend().stackCards(boardId, dragged.id, target.id);
  const batch = writeBatch(db);
  if (!target.groupId) {
    batch.update(doc(db, "boards", boardId, "cards", target.id), { groupId, updatedAt: serverTimestamp() });
  }
  batch.update(doc(db, "boards", boardId, "cards", dragged.id), {
    groupId,
    columnId: target.columnId,
    updatedAt: serverTimestamp(),
  });
  await batch.commit();
}

/** Admin only (D105): takes a card out of its stack. */
export async function unstackCard(
  boardId: string,
  cardId: string,
  db: Firestore = getFirebaseFirestore(),
): Promise<void> {
  if (isMockMode()) return getMockBackend().unstackCard(boardId, cardId);
  await updateDoc(doc(db, "boards", boardId, "cards", cardId), {
    groupId: null,
    updatedAt: serverTimestamp(),
  });
}

/** Admin only (D80): in-progress boards other than the current one, as move destinations. */
export async function listMoveTargetBoards(
  currentBoardId: string,
  db: Firestore = getFirebaseFirestore(),
): Promise<MoveTargetBoard[]> {
  if (isMockMode()) return getMockBackend().listMoveTargetBoards(currentBoardId);
  const snapshot = await getDocs(
    query(collection(db, "boards"), where("status", "==", "in-progress")),
  );
  return snapshot.docs
    .filter((boardDoc) => boardDoc.id !== currentBoardId)
    .map((boardDoc) => ({ id: boardDoc.id, title: String(boardDoc.data().title ?? boardDoc.id) }))
    .sort((first, second) => first.title.localeCompare(second.title));
}

/**
 * Admin only (D77). One atomic batch: ledger, destination copy and source delete. Rules tie the three
 * together, so a partial or altered move is rejected. The copy gets a new id and a new createdAt (D78).
 */
export async function moveCard(
  sourceBoardId: string,
  card: BoardCard,
  destinationBoardId: string,
  db: Firestore = getFirebaseFirestore(),
): Promise<void> {
  if (isMockMode()) return getMockBackend().moveCard(sourceBoardId, card, destinationBoardId);
  const destinationCard = doc(collection(db, "boards", destinationBoardId, "cards"));
  const batch = writeBatch(db);
  batch.set(doc(db, "boards", sourceBoardId, "cardMoves", card.id), {
    destBoardId: destinationBoardId,
    destCardId: destinationCard.id,
    movedAt: serverTimestamp(),
  });
  batch.set(destinationCard, {
    columnId: card.columnId,
    text: card.text,
    authorId: card.authorId,
    hidden: card.hidden,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    movedFromBoardId: sourceBoardId,
    movedFromCardId: card.id,
  });
  batch.delete(doc(db, "boards", sourceBoardId, "cards", card.id));
  await batch.commit();
}
