import {
  Timestamp,
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  type Firestore,
  type Unsubscribe,
} from "firebase/firestore";
import { getMockBackend, isMockMode } from "@/lib/mock";
import type { ActionItem, ActionItemStatus, ColumnId, SessionSnapshot } from "./types";
import { getFirebaseFirestore } from "./client";
import { isValidDueDate } from "@/lib/retro-analytics";

function asDate(value: unknown): Date | null {
  return value instanceof Timestamp ? value.toDate() : value instanceof Date ? value : null;
}

function isStatus(value: unknown): value is ActionItemStatus {
  return value === "not-started" || value === "in-progress" || value === "completed";
}

function toActionItem(id: string, data: Record<string, unknown>): ActionItem | null {
  if (typeof data.text !== "string" || typeof data.dueDate !== "string" || !isValidDueDate(data.dueDate) || !isStatus(data.status)) return null;
  return { id, text: data.text, dueDate: data.dueDate, status: data.status, createdAt: asDate(data.createdAt), completedAt: asDate(data.completedAt) };
}

function toSessionSnapshot(id: string, data: Record<string, unknown>): SessionSnapshot | null {
  const completedAt = asDate(data.completedAt);
  const counts = data.categoryCounts as Record<string, unknown> | undefined;
  if (!completedAt || !counts || typeof data.dueActionCount !== "number" || typeof data.completedDueActionCount !== "number" || !Number.isInteger(data.dueActionCount) || !Number.isInteger(data.completedDueActionCount) || data.dueActionCount < 0 || data.completedDueActionCount < 0 || data.completedDueActionCount > data.dueActionCount) return null;
  const keys: ColumnId[] = ["went-well", "to-improve", "ideas"];
  if (!keys.every((key) => Number.isInteger(counts[key]) && (counts[key] as number) >= 0)) return null;
  return {
    id,
    completedAt,
    categoryCounts: { "went-well": counts["went-well"] as number, "to-improve": counts["to-improve"] as number, ideas: counts.ideas as number },
    dueActionCount: data.dueActionCount,
    completedDueActionCount: data.completedDueActionCount,
  };
}

export function subscribeToActionItems(boardId: string, callback: (items: ActionItem[]) => void, onError: (error: unknown) => void, db: Firestore = getFirebaseFirestore()): Unsubscribe {
  if (isMockMode()) return getMockBackend().subscribeToActionItems(boardId, callback, onError);
  return onSnapshot(query(collection(db, "boards", boardId, "actionItems"), orderBy("createdAt")), (snapshot) => {
    callback(snapshot.docs.flatMap((item) => {
      const parsed = toActionItem(item.id, item.data({ serverTimestamps: "estimate" }));
      return parsed ? [parsed] : [];
    }));
  }, onError);
}

export function subscribeToSessionSnapshots(boardId: string, callback: (snapshots: SessionSnapshot[]) => void, onError: (error: unknown) => void, db: Firestore = getFirebaseFirestore()): Unsubscribe {
  if (isMockMode()) return getMockBackend().subscribeToSessionSnapshots(boardId, callback, onError);
  return onSnapshot(query(collection(db, "boards", boardId, "sessionSnapshots"), orderBy("completedAt")), (snapshot) => {
    callback(snapshot.docs.flatMap((item) => {
      const parsed = toSessionSnapshot(item.id, item.data());
      return parsed ? [parsed] : [];
    }));
  }, onError);
}

export async function createActionItem(boardId: string, text: string, dueDate: string, db: Firestore = getFirebaseFirestore()): Promise<void> {
  if (text.trim().length === 0 || text.trim().length > 500 || !isValidDueDate(dueDate)) throw new Error("กรุณาตรวจสอบรายการและวันครบกำหนด");
  if (isMockMode()) return getMockBackend().createActionItem(boardId, text.trim(), dueDate);
  await setDoc(doc(collection(db, "boards", boardId, "actionItems")), { text: text.trim(), dueDate, status: "not-started", createdAt: serverTimestamp(), completedAt: null });
}

export async function setActionItemStatus(boardId: string, itemId: string, status: ActionItemStatus, db: Firestore = getFirebaseFirestore()): Promise<void> {
  if (!isStatus(status)) throw new Error("สถานะรายการไม่ถูกต้อง");
  if (isMockMode()) return getMockBackend().setActionItemStatus(boardId, itemId, status);
  await updateDoc(doc(db, "boards", boardId, "actionItems", itemId), { status, completedAt: status === "completed" ? serverTimestamp() : null });
}

export async function editActionItem(boardId: string, itemId: string, text: string, dueDate: string, db: Firestore = getFirebaseFirestore()): Promise<void> {
  if (text.trim().length === 0 || text.trim().length > 500 || !isValidDueDate(dueDate)) throw new Error("กรุณาตรวจสอบรายการและวันครบกำหนด");
  if (isMockMode()) return getMockBackend().editActionItem(boardId, itemId, text.trim(), dueDate);
  await updateDoc(doc(db, "boards", boardId, "actionItems", itemId), { text: text.trim(), dueDate });
}

