import { describe, expect, it } from "vitest";
import { formatClock, remainingSeconds } from "../../lib/timer";

const NOW = new Date("2026-11-06T10:00:00Z");
const at = (secondsFromNow: number) => new Date(NOW.getTime() + secondsFromNow * 1000);

describe("remainingSeconds", () => {
  it("should return null when no timer is set", () => {
    expect(remainingSeconds(null, NOW)).toBeNull();
  });

  it("should round up so the last partial second still counts", () => {
    expect(remainingSeconds(at(90.2), NOW)).toBe(91);
  });

  it("should return 0 when the end time is now or already passed", () => {
    expect(remainingSeconds(at(0), NOW)).toBe(0);
    expect(remainingSeconds(at(-30), NOW)).toBe(0);
  });
});

describe("formatClock", () => {
  it("should show minutes and seconds with two digits", () => {
    expect(formatClock(0)).toBe("00:00");
    expect(formatClock(5)).toBe("00:05");
    expect(formatClock(65)).toBe("01:05");
    expect(formatClock(600)).toBe("10:00");
  });

  it("should add hours when an hour or more is left", () => {
    expect(formatClock(3600)).toBe("1:00:00");
    expect(formatClock(7199)).toBe("1:59:59");
  });
});
