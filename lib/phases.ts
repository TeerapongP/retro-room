/** The six steps of a session (F23, D116). Only the first two have real content; the others are placeholders (D118). */
export type Phase = {
  id: number;
  label: string;
  title: string;
  description: string;
  isBuilt: boolean;
};

const COMING_SOON = "เร็ว ๆ นี้: ขั้นตอนนี้ยังไม่เปิดใช้";

export const PHASES: readonly Phase[] = [
  {
    id: 1,
    label: "เขียน",
    title: "ขั้นที่ 1: เขียน",
    description: "ทุกคนเขียนการ์ดของตัวเอง คนอื่นจะยังไม่เห็นการ์ดของคุณจนกว่าจะถึงขั้นทบทวน",
    isBuilt: true,
  },
  {
    id: 2,
    label: "ทบทวน",
    title: "ขั้นที่ 2: ทบทวน",
    description: "อ่านการ์ดทั้งหมดด้วยกันแล้วคอมเมนต์ ขั้นนี้เขียน แก้ไข หรือลบการ์ดไม่ได้ ผู้ดำเนินรายการซ้อนการ์ดเรื่องเดียวกันได้",
    isBuilt: true,
  },
  {
    id: 3,
    label: "โหวต",
    title: "ขั้นที่ 3: โหวต",
    description: "เลือกการ์ดที่สำคัญที่สุด โหวตได้สูงสุด 3 อัน",
    isBuilt: true,
  },
  {
    id: 4,
    label: "ให้คะแนนตัวเอง",
    title: "ขั้นที่ 4: ให้คะแนนตัวเอง",
    description: "ให้คะแนนตัวเอง 1 ถึง 5 (ครั้งละ 0.5) สำหรับ sprint นี้ ทุกคนเห็นคะแนนของทุกคนและค่าเฉลี่ย",
    isBuilt: true,
  },
  {
    id: 5,
    label: "โฮสต์คนถัดไป",
    title: "ขั้นที่ 5: โฮสต์คนถัดไป",
    description: "หมุนวงล้อสุ่มโฮสต์คนถัดไป ผู้ดำเนินรายการเป็นคนกดหมุน ทุกคนเห็นผลพร้อมกัน",
    isBuilt: true,
  },
  { id: 6, label: "สรุป", title: "ขั้นที่ 6: สรุป", description: COMING_SOON, isBuilt: false },
];

export const FIRST_PHASE = 1;
export const LAST_PHASE = PHASES.length;

/** A stored `phase` that is missing or not a whole number means step 1; others are pulled into 1 to 6 (D117). */
export function clampPhase(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value)) return FIRST_PHASE;
  return Math.min(LAST_PHASE, Math.max(FIRST_PHASE, value));
}

export function phaseState(phaseId: number, currentPhase: number): "done" | "current" | "upcoming" {
  if (phaseId < currentPhase) return "done";
  return phaseId === currentPhase ? "current" : "upcoming";
}

export function nextPhase(currentPhase: number): number | null {
  return currentPhase < LAST_PHASE ? currentPhase + 1 : null;
}
