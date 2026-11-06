"use client";

import { useState, type FormEvent } from "react";
import { ModalDialog } from "@/components/ModalDialog";

const PRESET_MINUTES = [3, 5, 10, 15] as const;
const MAX_MINUTES = 120;

type TimerDialogProps = {
  onClose: () => void;
  onStart: (minutes: number) => void;
};

/** Admin picks the length of the shared countdown (F22, D110): a preset or 1 to 120 custom minutes. */
export function TimerDialog({ onClose, onStart }: TimerDialogProps) {
  const [custom, setCustom] = useState("");
  const customMinutes = Number(custom);
  const isCustomValid = Number.isInteger(customMinutes) && customMinutes >= 1 && customMinutes <= MAX_MINUTES;

  function handleCustom(event: FormEvent) {
    event.preventDefault();
    if (isCustomValid) onStart(customMinutes);
  }

  return (
    <ModalDialog title="Set timer" onClose={onClose}>
      <p>เลือกเวลานับถอยหลัง ทุกคนในบอร์ดจะเห็นเวลาเดียวกัน</p>
      <div className="timer-presets">
        {PRESET_MINUTES.map((minutes) => (
          <button key={minutes} type="button" className="pixel-button" onClick={() => onStart(minutes)}>
            {minutes} นาที
          </button>
        ))}
      </div>
      <form onSubmit={handleCustom} className="timer-custom">
        <label htmlFor="timer-custom-minutes" className="text-sm font-medium">
          หรือกำหนดเอง (1 ถึง {MAX_MINUTES} นาที)
        </label>
        <div className="timer-custom-row">
          <input
            id="timer-custom-minutes"
            className="pixel-input"
            inputMode="numeric"
            value={custom}
            onChange={(event) => setCustom(event.target.value.replace(/[^0-9]/g, "").slice(0, 3))}
            placeholder="เช่น 7"
          />
          <button type="submit" className="pixel-button pixel-button-gold" disabled={!isCustomValid}>
            เริ่ม
          </button>
        </div>
      </form>
      <div className="mt-4">
        <button type="button" className="pixel-button pixel-button-gold" onClick={onClose}>
          ยกเลิก
        </button>
      </div>
    </ModalDialog>
  );
}
