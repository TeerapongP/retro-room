/** Whole seconds left until `endsAt` (rounded up), 0 once it has passed, or null when no timer is set (F22, D111). */
export function remainingSeconds(endsAt: Date | null, now: Date = new Date()): number | null {
  if (!endsAt) return null;
  return Math.max(0, Math.ceil((endsAt.getTime() - now.getTime()) / 1000));
}

/** `MM:SS`, or `H:MM:SS` from one hour up. */
export function formatClock(totalSeconds: number): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
}
