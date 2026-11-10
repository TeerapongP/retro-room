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
import { isValidRating, type Rating } from "../ratings";
import { getFirebaseFirestore } from "./client";

/** All self ratings of a board (F28, D147). Documents with an invalid score are ignored. */
export function subscribeToRatings(
  boardId: string,
  onRatings: (ratings: Rating[]) => void,
  onError: (error: unknown) => void,
  db: Firestore = getFirebaseFirestore(),
): Unsubscribe {
  if (isMockMode()) return getMockBackend().subscribeToRatings(boardId, onRatings, onError);
  return onSnapshot(
    collection(db, "boards", boardId, "ratings"),
    (snapshot) =>
      onRatings(
        snapshot.docs.flatMap((ratingDoc) => {
          const score: unknown = ratingDoc.data().score;
          return isValidRating(score) ? [{ uid: ratingDoc.id, score }] : [];
        }),
      ),
    onError,
  );
}

/** Saves the member's score. Rules allow it only in step 4 and only for 1 to 5 in steps of 0.5. */
export async function saveMyRating(
  boardId: string,
  uid: string,
  score: number,
  db: Firestore = getFirebaseFirestore(),
): Promise<void> {
  if (isMockMode()) return getMockBackend().saveMyRating(boardId, uid, score);
  await setDoc(doc(db, "boards", boardId, "ratings", uid), { score, updatedAt: serverTimestamp() });
}
