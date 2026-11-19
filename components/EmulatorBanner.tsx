import { isFirebaseEmulatorEnabled } from "@/lib/firebase/client";
import { isMockMode } from "@/lib/mock";

export function EmulatorBanner() {
  if (isMockMode()) {
    return (
      <div role="status" className="pixel-note font-pixel px-3 py-2 text-center text-[32px]">
        โหมดจำลอง · ข้อมูลเฉพาะในหน้านี้ ไม่เชื่อมต่อฐานข้อมูลจริง
      </div>
    );
  }
  if (!isFirebaseEmulatorEnabled()) return null;
  return (
    <div role="status" className="pixel-note font-pixel px-3 py-2 text-center text-[32px]">
      โหมดทดสอบ · ข้อมูลทดสอบในเครื่อง ไม่ใช่ข้อมูลจริง
    </div>
  );
}
