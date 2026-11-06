import { describe, expect, it } from "vitest";
import { formatRelativeTime } from "../../lib/relative-time";

const NOW = new Date("2026-11-06T12:00:00Z");
const minutesAgo = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000);

describe("formatRelativeTime", () => {
  it("should return an empty string when the date is unknown", () => {
    expect(formatRelativeTime(null, NOW)).toBe("");
  });

  it("should say just now when under a minute has passed", () => {
    expect(formatRelativeTime(minutesAgo(0), NOW)).toBe("just now");
    expect(formatRelativeTime(new Date(NOW.getTime() - 59_000), NOW)).toBe("just now");
  });

  it("should say just now when the date is in the future because of clock skew", () => {
    expect(formatRelativeTime(new Date(NOW.getTime() + 30_000), NOW)).toBe("just now");
  });

  it("should use minutes when under an hour has passed", () => {
    expect(formatRelativeTime(minutesAgo(1), NOW)).toBe("1m ago");
    expect(formatRelativeTime(minutesAgo(59), NOW)).toBe("59m ago");
  });

  it("should use hours when under a day has passed", () => {
    expect(formatRelativeTime(minutesAgo(60), NOW)).toBe("1h ago");
    expect(formatRelativeTime(minutesAgo(23 * 60 + 59), NOW)).toBe("23h ago");
  });

  it("should use days when a day or more has passed", () => {
    expect(formatRelativeTime(minutesAgo(24 * 60), NOW)).toBe("1d ago");
    expect(formatRelativeTime(minutesAgo(3 * 24 * 60 + 5), NOW)).toBe("3d ago");
  });
});
