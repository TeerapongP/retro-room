import {
  collection,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  type Firestore,
  type Unsubscribe,
} from "firebase/firestore";
import { getMockBackend, isMockMode } from "../mock";
import type { Voter } from "../votes";
import { getFirebaseFirestore } from "./client";

/** All voter documents of a board (F26, D137). Counting is done by the caller with `countVotes`. */
export function subscribeToVotes(
  boardId: string,
  onVoters: (voters: Voter[]) => void,
  onError: (error: unknown) => void,
  db: Firestore = getFirebaseFirestore(),
): Unsubscribe {
  if (isMockMode()) return getMockBackend().subscribeToVotes(boardId, onVoters, onError);
  return onSnapshot(
    collection(db, "boards", boardId, "voters"),
    (snapshot) =>
      onVoters(
        snapshot.docs.map((voterDoc) => {
          const cardIds: unknown = voterDoc.data().cardIds;
          return {
            uid: voterDoc.id,
            cardIds: Array.isArray(cardIds) ? cardIds.filter((id): id is string => typeof id === "string") : [],
          };
        }),
      ),
    onError,
  );
}

/** Saves the member's whole list of voted cards. Rules allow it only in step 3 and only up to 3 distinct ids. */
export async function saveMyVotes(
  boardId: string,
  uid: string,
  cardIds: string[],
  db: Firestore = getFirebaseFirestore(),
): Promise<void> {
  if (isMockMode()) return getMockBackend().saveMyVotes(boardId, uid, cardIds);
  await setDoc(doc(db, "boards", boardId, "voters", uid), { cardIds, updatedAt: serverTimestamp() });
}
