/** Next-host wheel (F29, D149 to D151). */
export type WheelCandidate = { uid: string; name: string };

/** The same order on every device, so everyone sees the same segments. */
export function sortCandidates(candidates: ReadonlyArray<WheelCandidate>): WheelCandidate[] {
  return [...candidates].sort((first, second) => first.uid.localeCompare(second.uid));
}

/** Picks one uid; `random` returns a number in [0, 1). */
export function pickWinnerUid(candidates: ReadonlyArray<WheelCandidate>, random: () => number = Math.random): string | null {
  if (candidates.length === 0) return null;
  const index = Math.min(candidates.length - 1, Math.floor(random() * candidates.length));
  return sortCandidates(candidates)[index].uid;
}

export const WHEEL_TURNS = 5;
export const WHEEL_SPIN_MS = 5000;

/**
 * Final rotation in degrees (clockwise) that puts the middle of segment `index` under the pointer at the top.
 * Segment 0 starts at the top and runs clockwise.
 */
export function wheelAngle(index: number, count: number, turns: number = WHEEL_TURNS): number {
  if (count <= 0 || index < 0 || index >= count) return 0;
  const segment = 360 / count;
  return turns * 360 - (index + 0.5) * segment;
}
