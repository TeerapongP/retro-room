import type { User } from "firebase/auth";
import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
  type Firestore,
} from "firebase/firestore";
import { getFirebaseFirestore } from "./client";
import { isValidPlayerName, normalizePlayerName } from "./types";

/** Returns the player name, or null while the player has not chosen one yet. */
export async function getPlayerName(
  uid: string,
  db: Firestore = getFirebaseFirestore(),
): Promise<string | null> {
  const snapshot = await getDoc(doc(db, "users", uid));
  const data = snapshot.data();
  return snapshot.exists() && data?.nameSetAt ? data.displayName : null;
}

/** The name can be set once. Rules reject any later change. */
export async function savePlayerName(
  user: User,
  rawName: string,
  db: Firestore = getFirebaseFirestore(),
): Promise<string> {
  const playerName = normalizePlayerName(rawName);
  if (!isValidPlayerName(playerName)) {
    throw new Error("Invalid player name");
  }
  const profileRef = doc(db, "users", user.uid);
  const photoURL = user.photoURL ?? null;
  const existing = await getDoc(profileRef);
  if (existing.exists()) {
    await updateDoc(profileRef, {
      displayName: playerName,
      photoURL,
      nameSetAt: serverTimestamp(),
    });
  } else {
    await setDoc(profileRef, {
      displayName: playerName,
      photoURL,
      createdAt: serverTimestamp(),
      nameSetAt: serverTimestamp(),
    });
  }
  return playerName;
}
