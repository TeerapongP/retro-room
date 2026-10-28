import { isFirebaseEmulatorEnabled } from "@/lib/firebase/client";

export function EmulatorBanner() {
  if (!isFirebaseEmulatorEnabled()) return null;
  return (
    <div role="status" className="pixel-note font-pixel px-3 py-2 text-center text-[10px]">
      EMULATOR MODE · ข้อมูลทดสอบในเครื่องเท่านั้น ไม่ใช่ข้อมูลจริง
    </div>
  );
}
