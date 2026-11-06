"use client";

import { useEffect, useRef, useState } from "react";
import { TimerDialog } from "@/components/TimerDialog";
import { playSoftBeep } from "@/lib/beep";
import type { Board } from "@/lib/firebase/types";
import { formatClock, remainingSeconds } from "@/lib/timer";

type BoardTimerProps = {
  board: Board;
  isAdmin: boolean;
  onStart: (minutes: number) => void;
  onStop: () => void;
};

const TIME_UP_VISIBLE_MS = 6000;

/**
 * The shared countdown in the board heading (F22). Everyone sees the remaining time computed from the board's end time;
 * only the admin can set or stop it. When time runs out while the page is open, a small alert shows in the middle of the
 * screen and a soft beep plays. Nothing here blocks writing cards (D113).
 */
export function BoardTimer({ board, isAdmin, onStart, onStop }: BoardTimerProps) {
  const [now, setNow] = useState(() => new Date());
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [showTimeUp, setShowTimeUp] = useState(false);
  const previousRemaining = useRef<number | null>(null);
  const endsAt = board.timerEndsAt;
  const remaining = remainingSeconds(endsAt, now);

  useEffect(() => {
    if (!endsAt) return;
    // Refresh right away (a new end time must not be measured against an old clock reading), then every second.
    const tick = () => setNow(new Date());
    const first = setTimeout(tick, 0);
    const timer = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [endsAt]);

  useEffect(() => {
    const before = previousRemaining.current;
    previousRemaining.current = remaining;
    if (before !== null && before > 0 && remaining === 0) {
      setShowTimeUp(true);
      playSoftBeep();
    }
  }, [remaining]);

  useEffect(() => {
    if (!showTimeUp) return;
    const timer = setTimeout(() => setShowTimeUp(false), TIME_UP_VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [showTimeUp]);

  if (remaining === null && !isAdmin) return null;

  return (
    <>
      {remaining === null ? (
        <button type="button" className="board-button" onClick={() => setIsDialogOpen(true)}>
          ⏱ ตั้งเวลา
        </button>
      ) : (
        <div className={`board-timer ${remaining === 0 ? "board-timer-up" : ""}`} role="timer" aria-label="เวลาที่เหลือ">
          <span className="board-timer-clock">⏱ {formatClock(remaining)}</span>
          {remaining === 0 ? <span className="board-timer-label">หมดเวลา</span> : null}
          {isAdmin ? (
            <button type="button" className="board-button board-button-quiet" onClick={onStop}>
              {remaining === 0 ? "ล้าง" : "หยุด"}
            </button>
          ) : null}
        </div>
      )}
      {isDialogOpen ? (
        <TimerDialog
          onClose={() => setIsDialogOpen(false)}
          onStart={(minutes) => {
            setIsDialogOpen(false);
            onStart(minutes);
          }}
        />
      ) : null}
      {showTimeUp ? (
        <div role="alert" className="time-up-toast">
          ⏱ หมดเวลาแล้ว!
        </div>
      ) : null}
    </>
  );
}
