"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { WHEEL_SPIN_MS, sortCandidates, wheelAngle, type WheelCandidate } from "@/lib/wheel";

const SEGMENT_COLORS = ["#b6e8c4", "#f6a9b5", "#dcb5f0", "#ffe08a", "#a8d8f0", "#f9c89b"];
/** A result younger than this is spun on screen; an older one is shown as it ended. */
const FRESH_MS = 10_000;

type HostWheelProps = {
  candidates: WheelCandidate[];
  winnerUid: string | null;
  spunAt: Date | null;
  isAdmin: boolean;
  onSpin: () => void;
};

type SpinningWheelProps = { candidates: WheelCandidate[]; winnerUid: string | null; spunAt: Date | null };

function SpinningWheel({ candidates, winnerUid, spunAt }: SpinningWheelProps) {
  const winnerIndex = candidates.findIndex((candidate) => candidate.uid === winnerUid);
  const target = winnerIndex < 0 ? 0 : wheelAngle(winnerIndex, candidates.length);
  const [isFresh] = useState(() => spunAt !== null && winnerIndex >= 0 && Date.now() - spunAt.getTime() < FRESH_MS);
  const [angle, setAngle] = useState(isFresh ? 0 : target);
  const [isDone, setIsDone] = useState(!isFresh);

  useEffect(() => {
    if (!isFresh) return;
    const startTimer = setTimeout(() => setAngle(target), 60);
    const doneTimer = setTimeout(() => setIsDone(true), WHEEL_SPIN_MS + 200);
    return () => {
      clearTimeout(startTimer);
      clearTimeout(doneTimer);
    };
  }, [isFresh, target]);

  const segment = 360 / Math.max(1, candidates.length);
  const gradient = candidates
    .map((_, index) => `${SEGMENT_COLORS[index % SEGMENT_COLORS.length]} ${index * segment}deg ${(index + 1) * segment}deg`)
    .join(", ");
  const winnerName = candidates[winnerIndex]?.name;

  return (
    <>
      <div className="host-wheel-stage">
        <span className="host-wheel-pointer" aria-hidden="true" />
        <div
          className="host-wheel"
          style={{
            background: `conic-gradient(${gradient})`,
            transform: `rotate(${angle}deg)`,
            transition: isFresh ? `transform ${WHEEL_SPIN_MS}ms cubic-bezier(0.12, 0.6, 0.1, 1)` : "none",
          }}
        >
          {candidates.map((candidate, index) => (
            <span
              key={candidate.uid}
              className="host-wheel-label"
              style={{ "--label-angle": `${(index + 0.5) * segment}deg` } as CSSProperties}
            >
              {candidate.name}
            </span>
          ))}
        </div>
      </div>
      <p className="host-wheel-result" role="status">
        {winnerName === undefined ? "ยังไม่ได้หมุน" : isDone ? `โฮสต์คนถัดไป: ${winnerName}` : "กำลังหมุน…"}
      </p>
    </>
  );
}

/** Step 5 (F29): the admin spins a wheel of the board's members and everyone sees the same result. */
export function HostWheel({ candidates, winnerUid, spunAt, isAdmin, onSpin }: HostWheelProps) {
  const sorted = sortCandidates(candidates);
  const [isSpinLocked, setIsSpinLocked] = useState(false);

  function handleSpin() {
    setIsSpinLocked(true);
    onSpin();
    setTimeout(() => setIsSpinLocked(false), WHEEL_SPIN_MS + 500);
  }

  return (
    <section className="host-wheel-panel pixel-panel" aria-label="สุ่มโฮสต์คนถัดไป">
      <SpinningWheel key={spunAt?.getTime() ?? "none"} candidates={sorted} winnerUid={winnerUid} spunAt={spunAt} />
      {isAdmin ? (
        <button type="button" className="pixel-button pixel-button-gold" disabled={isSpinLocked || sorted.length === 0} onClick={handleSpin}>
          {winnerUid ? "หมุนอีกครั้ง" : "หมุนวงล้อ"}
        </button>
      ) : (
        <p className="host-wheel-hint">รอผู้ดำเนินรายการหมุนวงล้อ</p>
      )}
    </section>
  );
}
