import { isFirebaseEmulatorEnabled } from "@/lib/firebase/client";
import { isMockMode } from "@/lib/mock";

export function EmulatorBanner() {
  if (isMockMode()) {
    return (
      <div role="status" className="pixel-note font-pixel px-3 py-2 text-center text-[32px]">
        MOCK MODE · ข้อมูลจำลองในหน้านี้เท่านั้น ไม่ต่อ Firebase
      </div>
    );
  }
  if (!isFirebaseEmulatorEnabled()) return null;
  return (
    <div role="status" className="pixel-note font-pixel px-3 py-2 text-center text-[32px]">
      EMULATOR MODE · ข้อมูลทดสอบในเครื่องเท่านั้น ไม่ใช่ข้อมูลจริง
    </div>
  );
}
