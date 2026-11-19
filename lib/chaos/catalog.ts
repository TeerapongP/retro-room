export type ChaosCategory = "defense" | "chaos" | "luck" | "wheel" | "strategy";
export type ChaosWindow = "shopping" | "between-turns" | "before-player-spin" | "after-player-spin" | "before-event-spin" | "reaction" | "automatic";
export type ChaosTarget = "self" | "player" | "item" | "candidate-set" | "event-category" | "none";

export type ChaosItem = {
  id: string;
  name: string;
  price: number;
  category: ChaosCategory;
  mechanic: string;
  window: ChaosWindow;
  target: ChaosTarget;
  description: string;
  nameTh: string;
  descriptionTh: string;
};

const ITEMS = [
  { id: "holy-shield", name: "Holy Shield", price: 20, category: "defense", mechanic: "negate-hazard", window: "reaction", target: "self" },
  { id: "mirror-guard", name: "Mirror Guard", price: 25, category: "defense", mechanic: "reflect-hazard", window: "reaction", target: "self" },
  { id: "second-chance", name: "Second Chance", price: 20, category: "defense", mechanic: "replace-event", window: "reaction", target: "none" },
  { id: "curse-cleanser", name: "Curse Cleanser", price: 15, category: "defense", mechanic: "remove-curse", window: "between-turns", target: "self" },
  { id: "safe-passage", name: "Safe Passage", price: 20, category: "defense", mechanic: "skip-next-selection", window: "before-player-spin", target: "self" },
  { id: "guardian-angel", name: "Guardian Angel", price: 25, category: "defense", mechanic: "intercept-threshold", window: "between-turns", target: "self" },
  { id: "iron-will", name: "Iron Will", price: 15, category: "defense", mechanic: "negate-status", window: "reaction", target: "self" },
  { id: "chaos-bomb", name: "Chaos Bomb", price: 25, category: "chaos", mechanic: "attack-curse", window: "between-turns", target: "player" },
  { id: "freeze-spell", name: "Freeze Spell", price: 15, category: "chaos", mechanic: "lock-offense", window: "between-turns", target: "player" },
  { id: "eris-thief", name: "Eris Thief", price: 20, category: "chaos", mechanic: "steal-eris", window: "shopping", target: "player" },
  { id: "curse-transfer", name: "Curse Transfer", price: 25, category: "chaos", mechanic: "transfer-curse", window: "between-turns", target: "player" },
  { id: "reverse-card", name: "Reverse Card", price: 20, category: "chaos", mechanic: "reverse-target", window: "reaction", target: "self" },
  { id: "target-mark", name: "Target Mark", price: 15, category: "chaos", mechanic: "increase-target-weight", window: "before-player-spin", target: "player" },
  { id: "mischief-dice", name: "Mischief Dice", price: 20, category: "chaos", mechanic: "random-nuisance", window: "between-turns", target: "player" },
  { id: "lucky-charm", name: "Lucky Charm", price: 15, category: "luck", mechanic: "reduce-own-weight", window: "before-player-spin", target: "self" },
  { id: "fortune-cookie", name: "Fortune Cookie", price: 10, category: "luck", mechanic: "private-event-hint", window: "before-event-spin", target: "none" },
  { id: "destiny-swap", name: "Destiny Swap", price: 30, category: "luck", mechanic: "consensual-curse-swap", window: "between-turns", target: "player" },
  { id: "lucky-seven", name: "Lucky Seven", price: 10, category: "luck", mechanic: "exact-seven-recovery", window: "between-turns", target: "self" },
  { id: "probability-shift", name: "Probability Shift", price: 25, category: "luck", mechanic: "shift-event-probability", window: "before-event-spin", target: "event-category" },
  { id: "treasure-blessing", name: "Treasure Blessing", price: 15, category: "luck", mechanic: "grant-eris", window: "shopping", target: "self" },
  { id: "fate-insurance", name: "Fate Insurance", price: 20, category: "luck", mechanic: "conditional-eris-reimbursement", window: "before-event-spin", target: "self" },
  { id: "re-spin-token", name: "Re-spin Token", price: 20, category: "wheel", mechanic: "reroll-player", window: "after-player-spin", target: "none" },
  { id: "wheel-brake", name: "Wheel Brake", price: 15, category: "wheel", mechanic: "clear-weight-modifiers", window: "before-player-spin", target: "none" },
  { id: "double-spin", name: "Double Spin", price: 30, category: "wheel", mechanic: "add-independent-event", window: "before-event-spin", target: "none" },
  { id: "time-rewind", name: "Time Rewind", price: 30, category: "wheel", mechanic: "cancel-pending-item", window: "reaction", target: "self" },
  { id: "chaos-compass", name: "Chaos Compass", price: 10, category: "wheel", mechanic: "preview-top-candidate", window: "before-player-spin", target: "none" },
  { id: "wheel-peek", name: "Wheel Peek", price: 10, category: "wheel", mechanic: "inspect-full-probabilities", window: "before-player-spin", target: "none" },
  { id: "spin-delay", name: "Spin Delay", price: 20, category: "wheel", mechanic: "postpone-spin", window: "before-player-spin", target: "none" },
  { id: "royal-decree", name: "Royal Decree", price: 30, category: "strategy", mechanic: "restrict-candidate-subset", window: "before-player-spin", target: "candidate-set" },
  { id: "secret-pact", name: "Secret Pact", price: 20, category: "strategy", mechanic: "mutual-attack-protection", window: "between-turns", target: "player" },
  { id: "item-sabotage", name: "Item Sabotage", price: 25, category: "strategy", mechanic: "disable-target-item", window: "between-turns", target: "item" },
  { id: "emergency-escape", name: "Emergency Escape", price: 25, category: "strategy", mechanic: "escape-after-selection", window: "after-player-spin", target: "self" },
  { id: "last-stand", name: "Last Stand", price: 20, category: "strategy", mechanic: "threshold-recovery", window: "automatic", target: "self" },
  { id: "chaos-auction", name: "Chaos Auction", price: 20, category: "strategy", mechanic: "consensual-item-trade", window: "shopping", target: "player" },
  { id: "final-verdict", name: "Final Verdict", price: 30, category: "strategy", mechanic: "final-event-veto", window: "reaction", target: "none" },
] as const satisfies readonly Omit<ChaosItem, "description" | "nameTh" | "descriptionTh">[];

const DESCRIPTIONS: Record<(typeof ITEMS)[number]["id"], string> = {
  "holy-shield": "Cancel one incoming negative Chaos event.",
  "mirror-guard": "Reflect one targeted hazard to its attacker.",
  "second-chance": "Discard the pending event and draw one replacement.",
  "curse-cleanser": "Remove one Curse between turns.",
  "safe-passage": "Skip the next Player Wheel draw without leaving the game.",
  "guardian-angel": "Intercept the Curse gain that would cross three Curse.",
  "iron-will": "Negate one Freeze or action restriction.",
  "chaos-bomb": "Send one Curse attack to another active player.",
  "freeze-spell": "Block a target's offensive items for the next turn.",
  "eris-thief": "Steal up to ten unspent Eris during shopping.",
  "curse-transfer": "Move one of your Curses to an eligible player.",
  "reverse-card": "Redirect an incoming item attack to its attacker.",
  "target-mark": "Raise one target's next Player Wheel weight by 50%.",
  "mischief-dice": "Send a server-drawn nuisance effect to a target.",
  "lucky-charm": "Lower your next Player Wheel weight by 40%.",
  "fortune-cookie": "Privately preview two possible event categories.",
  "destiny-swap": "Propose a complete Curse-total swap with consent.",
  "lucky-seven": "At exactly seven Curse, remove three.",
  "probability-shift": "Raise one event category's chance by ten points.",
  "treasure-blessing": "Gain fifteen Eris during shopping.",
  "fate-insurance": "Recover fifteen Eris if the next event adds Curse.",
  "re-spin-token": "Discard the selected player and draw again once.",
  "wheel-brake": "Clear temporary Player Wheel weight changes for one spin.",
  "double-spin": "Add one independent, nonrecursive event this turn.",
  "time-rewind": "Cancel a pending item action affecting you.",
  "chaos-compass": "Privately see candidate count and highest weight.",
  "wheel-peek": "Privately see the full Player Wheel probabilities.",
  "spin-delay": "Postpone the next spin by one admin action.",
  "royal-decree": "Choose a subset of at least three eligible candidates.",
  "secret-pact": "Propose mutual protection from each other's attacks.",
  "item-sabotage": "Disable one visible enemy offensive item for one turn.",
  "emergency-escape": "Escape your selection and draw among the others.",
  "last-stand": "At four Curse, recover one and resist more this turn.",
  "chaos-auction": "Propose an atomic trade of unused items.",
  "final-verdict": "Veto the final turn's event for a neutral Safe event.",
};

const THAI_NAMES: Record<(typeof ITEMS)[number]["id"], string> = {
  "holy-shield": "โล่ศักดิ์สิทธิ์", "mirror-guard": "กระจกสะท้อนภัย", "second-chance": "โอกาสแก้มือ",
  "curse-cleanser": "ชำระมหาภัย", "safe-passage": "ทางปลอดภัย", "guardian-angel": "เทพพิทักษ์", "iron-will": "ใจเหล็ก",
  "chaos-bomb": "ระเบิดมหาภัย", "freeze-spell": "คาถาแช่แข็ง", "eris-thief": "จอมโจรเอริส", "curse-transfer": "ย้ายมหาภัย",
  "reverse-card": "ไพ่ย้อนศร", "target-mark": "หมายหัว", "mischief-dice": "ลูกเต๋าป่วน", "lucky-charm": "เครื่องรางนำโชค",
  "fortune-cookie": "คุกกี้ทำนาย", "destiny-swap": "แลกชะตา", "lucky-seven": "เจ็ดนำโชค", "probability-shift": "พลิกโอกาส",
  "treasure-blessing": "พรสมบัติ", "fate-insurance": "ประกันชะตา", "re-spin-token": "เหรียญหมุนใหม่", "wheel-brake": "เบรกวงล้อ",
  "double-spin": "หมุนซ้ำสองเท่า", "time-rewind": "ย้อนเวลา", "chaos-compass": "เข็มทิศมหาภัย", "wheel-peek": "แอบดูโอกาส",
  "spin-delay": "ชะลอวงล้อ", "royal-decree": "ราชโองการ", "secret-pact": "พันธสัญญาลับ", "item-sabotage": "ปิดผนึกไอเทม",
  "emergency-escape": "ทางหนีฉุกเฉิน", "last-stand": "ยืนหยัดครั้งสุดท้าย", "chaos-auction": "ตลาดแลกเปลี่ยน", "final-verdict": "คำตัดสินสุดท้าย",
};

const THAI_DESCRIPTIONS: Record<(typeof ITEMS)[number]["id"], string> = {
  "holy-shield": "ยกเลิกเหตุร้ายที่กำลังส่งผลต่อตัวเองหนึ่งครั้ง",
  "mirror-guard": "สะท้อนการโจมตีที่มีผู้ก่อเหตุให้ย้อนกลับไปหาเจ้าของการโจมตี",
  "second-chance": "ยกเลิกผลวงล้อมหาภัยที่กำลังรออยู่ แล้วสุ่มผลใหม่หนึ่งครั้ง",
  "curse-cleanser": "ลบแต้มมหาภัยของตัวเองหนึ่งแต้มระหว่างรอบ",
  "safe-passage": "งดเป็นผู้ถูกเลือกในการหมุนวงล้อผู้เล่นครั้งถัดไป",
  "guardian-angel": "ป้องกันแต้มมหาภัยที่กำลังเพิ่มจาก 3 แต้มขึ้นไปหนึ่งครั้ง",
  "iron-will": "ลบหรือป้องกันสถานะแช่แข็งหนึ่งครั้ง",
  "chaos-bomb": "ส่งแต้มมหาภัยหนึ่งแต้มให้ผู้เล่นอื่นหลังเปิดโอกาสโต้ตอบ",
  "freeze-spell": "ห้ามเป้าหมายใช้ไอเทมโจมตีในรอบถัดไป",
  "eris-thief": "ขโมยเอริสที่ยังเหลือจากผู้ซื้อคนอื่นได้สูงสุด 10 เอริส",
  "curse-transfer": "ย้ายแต้มมหาภัยหนึ่งแต้มให้ผู้เล่นอื่น หากถูกขัดขวางแต้มจะยังอยู่กับคุณ",
  "reverse-card": "เปลี่ยนเป้าหมายของการโจมตีที่กำลังมาหาคุณกลับไปยังผู้โจมตี",
  "target-mark": "เพิ่มโอกาสถูกเลือกของเป้าหมาย 50% ในการหมุนครั้งถัดไป",
  "mischief-dice": "สุ่มทำให้เป้าหมายเสียเอริส ถูกล็อกไอเทมโจมตี หรือมีโอกาสถูกเลือกเพิ่ม",
  "lucky-charm": "ลดโอกาสถูกเลือกของตัวเอง 40% ในการหมุนครั้งถัดไป",
  "fortune-cookie": "แอบดูผลที่เป็นไปได้สองแบบ โดยหนึ่งในนั้นจะเกิดขึ้นแน่นอน",
  "destiny-swap": "เสนอแลกแต้มมหาภัยทั้งหมดกับผู้เล่นอื่น ต้องได้รับการยินยอม",
  "lucky-seven": "เมื่อมีแต้มมหาภัยครบ 7 แต้ม จะลบออก 3 แต้ม",
  "probability-shift": "เพิ่มโอกาสของเหตุการณ์หนึ่ง 10 จุดเปอร์เซ็นต์ แล้วปรับสัดส่วนใหม่",
  "treasure-blessing": "รับเอริสเพิ่ม 15 เหรียญระหว่างช่วงซื้อของ",
  "fate-insurance": "รับเอริสคืน 15 เหรียญ หากแต้มมหาภัยเพิ่มในรอบถัดไป",
  "re-spin-token": "สุ่มผู้เล่นคนใหม่ หลังเห็นผลเลือกผู้เล่นแล้วหนึ่งครั้ง",
  "wheel-brake": "ล้างตัวปรับโอกาสชั่วคราวก่อนหมุนวงล้อผู้เล่นครั้งถัดไป",
  "double-spin": "เพิ่มเหตุการณ์อิสระอีกหนึ่งครั้งให้ผู้เล่นที่ถูกเลือก",
  "time-rewind": "ยกเลิกการโจมตีจากไอเทมที่ยังไม่เกิดผลและกำลังเล็งมาที่คุณ",
  "chaos-compass": "แอบดูจำนวนผู้เล่นที่มีสิทธิ์และผู้ที่มีโอกาสสูงสุด",
  "wheel-peek": "แอบดูสัดส่วนโอกาสของผู้เล่นที่มีสิทธิ์ทุกคน",
  "spin-delay": "เลื่อนการหมุนครั้งถัดไปได้หนึ่งการกระทำ ใช้ได้ครั้งเดียวต่อเกม",
  "royal-decree": "เลือกผู้เล่นที่มีสิทธิ์อย่างน้อย 3 คนสำหรับการหมุนครั้งถัดไป",
  "secret-pact": "เสนอข้อตกลงคุ้มครองการโจมตีระหว่างกันหนึ่งรอบ ต้องได้รับการยินยอม",
  "item-sabotage": "ปิดการใช้งานไอเทมโจมตีที่ยังไม่ถูกใช้ของผู้เล่นอื่นหนึ่งรอบ",
  "emergency-escape": "หนีจากการถูกเลือก แล้วสุ่มเลือกจากผู้เล่นคนอื่นที่มีสิทธิ์",
  "last-stand": "เมื่อแต้มมหาภัยเพิ่มถึง 4 จะลดลงหนึ่งแต้มและป้องกันต่อจนจบรอบ",
  "chaos-auction": "เสนอแลกไอเทมที่ยังไม่ใช้กับผู้เล่นอื่น ทั้งสองฝ่ายต้องยินยอม",
  "final-verdict": "แทนที่เหตุการณ์ในรอบสุดท้ายด้วยผลปลอดภัย ใช้ได้ครั้งเดียว",
};

export const CHAOS_ITEMS = ITEMS.map(item => ({
  ...item,
  description: DESCRIPTIONS[item.id],
  nameTh: THAI_NAMES[item.id],
  descriptionTh: THAI_DESCRIPTIONS[item.id],
}));

export type ChaosItemId = (typeof CHAOS_ITEMS)[number]["id"];
export const CHAOS_ITEM_BY_ID: Record<ChaosItemId, (typeof CHAOS_ITEMS)[number]> = Object.fromEntries(CHAOS_ITEMS.map(item => [item.id, item])) as Record<ChaosItemId, (typeof CHAOS_ITEMS)[number]>;
export function isChaosItemId(value: unknown): value is ChaosItemId {
  return typeof value === "string" && Object.hasOwn(CHAOS_ITEM_BY_ID, value);
}
