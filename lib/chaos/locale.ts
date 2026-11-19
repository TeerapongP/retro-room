import type { ChaosEventId, ChaosGameState } from "./state";
import type { ChaosWindow } from "./catalog";
import { CHAOS_ITEM_BY_ID, type ChaosItemId } from "./catalog";

export const CHAOS_UI = {
  title: "วงล้อมหาภัย",
  subtitle: "เทศกาลหมู่บ้านแห่งโชคชะตา",
  phase: { setup: "เตรียมเกม", shopping: "เปิดร้านค้า", chaos_rounds: "รอบมหาภัย", final_host_selection: "เลือกโฮสต์คนถัดไป", finished: "จบเกมแล้ว" },
  turn: { ready: "พร้อมแล้ว", player_spin: "กำลังเลือกผู้เล่น", event_spin: "กำลังเลือกเหตุการณ์", reaction_window: "ช่วงตอบโต้", resolving: "กำลังคิดผล", turn_complete: "จบรอบแล้ว" },
  categories: { all: "ทุกหมวด", defense: "ป้องกัน", chaos: "ป่วนเกม", luck: "โชคชะตา", wheel: "วงล้อ", strategy: "กลยุทธ์" },
  windows: {
    shopping: "ช่วงซื้อของ", "between-turns": "ระหว่างรอบ", "before-player-spin": "ก่อนหมุนเลือกผู้เล่น",
    "after-player-spin": "หลังเลือกผู้เล่น", "before-event-spin": "ก่อนหมุนเหตุการณ์", reaction: "ช่วงตอบโต้", automatic: "ทำงานอัตโนมัติ",
  } satisfies Record<ChaosWindow, string>,
  events: {
    cursed: "คำสาป", frozen: "แช่แข็ง", reverse: "ย้อนกลับ", targeted: "ตกเป็นเป้าหมาย", safe: "ปลอดภัย",
    fortune: "โชคดี", "double-trouble": "มหาภัยสองเท่า", "royal-favor": "พรแห่งราชา",
  } satisfies Record<ChaosEventId, string>,
  errors: {
    soldOut: "ไอเทมนี้มีคนซื้อไปแล้ว", insufficient: "เอริสไม่เพียงพอ", limit: "กระเป๋าไอเทมเต็มแล้ว",
    denied: "คุณไม่มีสิทธิ์ทำรายการนี้", phase: "ยังทำรายการนี้ในช่วงปัจจุบันไม่ได้", network: "การเชื่อมต่อขัดข้อง กำลังรอข้อมูลล่าสุด",
    generic: "ทำรายการไม่สำเร็จ กรุณาลองอีกครั้ง",
  },
} as const;

export function phaseLabel(phase: ChaosGameState["phase"]): string { return CHAOS_UI.phase[phase]; }
export function turnLabel(phase: ChaosGameState["turnPhase"]): string { return CHAOS_UI.turn[phase]; }

export function localizeChaosError(message: string): string {
  if (/sold out/i.test(message)) return CHAOS_UI.errors.soldOut;
  if (/insufficient|eris/i.test(message)) return CHAOS_UI.errors.insufficient;
  if (/limit|inventory/i.test(message)) return CHAOS_UI.errors.limit;
  if (/permission|admin|required|eligible/i.test(message)) return CHAOS_UI.errors.denied;
  if (/phase|window|turn|event|action|proposal/i.test(message)) return CHAOS_UI.errors.phase;
  return CHAOS_UI.errors.generic;
}

export function formatChaosHistory(entry: string, nameOf: (uid: string) => string): string {
  const [kind, first, second, third] = entry.split(":");
  if (kind === "purchase") return `${nameOf(first)} ซื้อ${itemName(second)}`;
  if (kind === "player") return `รอบที่ ${first} เลือก ${nameOf(second)}`;
  if (kind === "event") return `รอบที่ ${first} เกิดเหตุการณ์: ${eventName(second)}`;
  if (kind === "resolved") return `รอบที่ ${first} จัดการเหตุการณ์แล้ว`;
  if (kind === "item") return `${nameOf(first)} ใช้${itemName(second)}${third ? ` ใส่ ${nameOf(third)}` : ""}`;
  if (kind === "host-selected") return `วงล้อเลือกโฮสต์คนถัดไป: ${nameOf(first)}`;
  if (kind === "host-exclusions") return "ปรับรายชื่อผู้มีสิทธิ์เป็นโฮสต์คนถัดไปแล้ว";
  if (kind === "eligibility") return "ปรับรายชื่อผู้มีสิทธิ์ในวงล้อแล้ว";
  if (kind === "spin-delayed") return `เลื่อนการหมุนในรอบที่ ${first}`;
  if (kind === "blocked" || kind === "applied") return `${kind === "blocked" ? "ป้องกัน" : "เกิดผล"} ${second} กับ ${nameOf(entry.split(":")[2] ?? "")}`;
  return "มีการอัปเดตเกม";
}

function itemName(id: string | undefined): string {
  return CHAOS_ITEM_BY_ID[id as ChaosItemId]?.nameTh ?? "ไอเทม";
}

function eventName(id: string | undefined): string { return CHAOS_UI.events[id as ChaosEventId] ?? "เหตุการณ์"; }
