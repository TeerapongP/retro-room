const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** Short English age such as `5m ago`, `2h ago`, `3d ago` (F18, D84). Future dates (clock skew) read as `just now`. */
export function formatRelativeTime(date: Date | null, now: Date = new Date()): string {
  if (!date) return "";
  const elapsed = now.getTime() - date.getTime();
  if (elapsed < MINUTE_MS) return "just now";
  if (elapsed < HOUR_MS) return `${Math.floor(elapsed / MINUTE_MS)}m ago`;
  if (elapsed < DAY_MS) return `${Math.floor(elapsed / HOUR_MS)}h ago`;
  return `${Math.floor(elapsed / DAY_MS)}d ago`;
}
