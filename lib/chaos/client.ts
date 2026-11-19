import { doc, onSnapshot } from "firebase/firestore";
import { getFirebaseAuth, getFirebaseFirestore } from "@/lib/firebase/client";
import { isMockMode } from "@/lib/mock";
import { runMockChaosAction, subscribeMockChaosGame } from "./mock";
import type { ChaosGameState } from "./state";

type ActionResult = { gameId: string; game: ChaosGameState; privateResult?: unknown };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

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
  const user = getFirebaseAuth().currentUser;
  if (!user) throw new Error("Sign in required");

  const response = await fetch("/api/chaos-action", {
    method: "POST",
    headers: {
      authorization: `Bearer ${await user.getIdToken()}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ boardId, requestId, action, ...payload }),
  });
  const result: unknown = await response.json();
  if (!response.ok) {
    const error = isRecord(result) && isRecord(result.error) && typeof result.error.message === "string"
      ? result.error.message
      : "Action failed";
    throw new Error(error);
  }
  if (!isRecord(result) || typeof result.gameId !== "string" || !isRecord(result.game)) {
    throw new Error("Invalid Chaos response");
  }
  return {
    gameId: result.gameId,
    game: result.game as ChaosGameState,
    ...(Object.hasOwn(result, "privateResult") ? { privateResult: result.privateResult } : {}),
  };
}
