import { describe, expect, it } from "vitest";
import {
  MEDIA_RETENTION_DAYS,
  daysUntilPurge,
  isEligibleForPurge,
  purgeDueAt,
} from "./media-purge";

const DAY_MS = 24 * 60 * 60 * 1000;
const USED_AT = new Date("2026-01-01T00:00:00Z");
const DUE = new Date(USED_AT.getTime() + MEDIA_RETENTION_DAYS * DAY_MS);

describe("purgeDueAt", () => {
  it("returns 30 days after usedAt for used items", () => {
    const due = purgeDueAt({ status: "used", usedAt: USED_AT });
    expect(due?.toISOString()).toBe(DUE.toISOString());
  });

  it("returns null for items that aren't used", () => {
    expect(purgeDueAt({ status: "new", usedAt: null })).toBeNull();
    expect(purgeDueAt({ status: "archived", usedAt: USED_AT })).toBeNull();
  });

  it("returns null when usedAt is missing even if status says used", () => {
    expect(purgeDueAt({ status: "used", usedAt: null })).toBeNull();
  });

  it("honors a custom retention window", () => {
    const due = purgeDueAt({ status: "used", usedAt: USED_AT }, 7);
    expect(due?.getTime()).toBe(USED_AT.getTime() + 7 * DAY_MS);
  });
});

describe("isEligibleForPurge", () => {
  const media = { status: "used" as const, usedAt: USED_AT };

  it("is false before the window elapses", () => {
    const oneDayBefore = new Date(DUE.getTime() - DAY_MS);
    expect(isEligibleForPurge(media, oneDayBefore)).toBe(false);
  });

  it("is true exactly at the due moment", () => {
    expect(isEligibleForPurge(media, DUE)).toBe(true);
  });

  it("is true after the window elapses", () => {
    const oneDayAfter = new Date(DUE.getTime() + DAY_MS);
    expect(isEligibleForPurge(media, oneDayAfter)).toBe(true);
  });

  it("never purges non-used items", () => {
    const later = new Date(DUE.getTime() + 365 * DAY_MS);
    expect(isEligibleForPurge({ status: "new", usedAt: null }, later)).toBe(
      false,
    );
    expect(
      isEligibleForPurge({ status: "archived", usedAt: USED_AT }, later),
    ).toBe(false);
  });
});

describe("daysUntilPurge", () => {
  it("counts down whole days, rounding up", () => {
    const halfway = new Date(USED_AT.getTime() + 15.5 * DAY_MS);
    expect(daysUntilPurge({ status: "used", usedAt: USED_AT }, halfway)).toBe(
      15,
    );
  });

  it("floors at 0 once past due", () => {
    const after = new Date(DUE.getTime() + 5 * DAY_MS);
    expect(daysUntilPurge({ status: "used", usedAt: USED_AT }, after)).toBe(0);
  });

  it("returns null for items not on the clock", () => {
    expect(daysUntilPurge({ status: "new", usedAt: null }, DUE)).toBeNull();
  });
});
