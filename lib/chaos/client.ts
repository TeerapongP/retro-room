import { doc, onSnapshot } from "firebase/firestore";
import { connectFunctionsEmulator, getFunctions, httpsCallable } from "firebase/functions";
import { getFirebaseApp, getFirebaseFirestore, isFirebaseEmulatorEnabled } from "@/lib/firebase/client";
import { isMockMode } from "@/lib/mock";
import { runMockChaosAction, subscribeMockChaosGame } from "./mock";
import type { ChaosGameState } from "./state";

type ActionResult = { gameId: string; game: ChaosGameState; privateResult?: unknown };

let functionsEmulatorConnected = false;

export function subscribeChaosGame(
  boardId: string,
  gameId: string,
  onGame: (game: ChaosGameState | null) => void,
  onError: (error: unknown) => void,
): () => void {
  if (isMockMode()) return subscribeMockChaosGame(boardId, gameId, onGame);
  return onSnapshot(
    doc(getFirebaseFirestore(), "boards", boardId, "chaosGames", gameId),
    (snapshot) => onGame(snapshot.exists() ? snapshot.data() as ChaosGameState : null),
    onError,
  );
}

export async function runChaosAction(
  boardId: string,
  requestId: string,
  action: string,
  payload: Record<string, unknown> = {},
): Promise<ActionResult> {
  if (isMockMode()) return runMockChaosAction(boardId, requestId, action, payload);
  const functions = getFunctions(getFirebaseApp());
  if (isFirebaseEmulatorEnabled() && !functionsEmulatorConnected) {
    connectFunctionsEmulator(functions, "127.0.0.1", 5001);
    functionsEmulatorConnected = true;
  }
  const callable = httpsCallable<Record<string, unknown>, ActionResult>(functions, "chaosAction");
  const result = await callable({ boardId, requestId, action, ...payload });
  return result.data;
}
