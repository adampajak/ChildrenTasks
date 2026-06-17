import { describe, it, expect, vi, afterEach } from "vitest";
import { getTodayLocal } from "@/lib/date";

describe("getTodayLocal", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns local calendar date, not UTC date, when past midnight in UTC+2", () => {
    // 2024-07-15T22:30:00Z = 00:30 CEST (UTC+2) on 2024-07-16
    // With the old toISOString() pattern this would return "2024-07-15" (UTC date — wrong).
    // With Intl.DateTimeFormat("en-CA") this returns "2024-07-16" (local date — correct).
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-07-15T22:30:00.000Z"));
    expect(getTodayLocal()).toBe("2024-07-16");
  });
});
