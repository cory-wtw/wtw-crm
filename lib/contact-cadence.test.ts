import { describe, expect, it } from "vitest";
import {
  contactCadenceDays,
  contactDueDate,
  hasFiled,
  needsContactCadence,
  MONTHLY_CONTACT_DAYS,
  WEEKLY_CONTACT_DAYS,
} from "./contact-cadence";

describe("hasFiled", () => {
  it("is true once filed or won", () => {
    expect(hasFiled("filed")).toBe(true);
    expect(hasFiled("won")).toBe(true);
  });

  it("is false before filing, and for a closed-out pipeline", () => {
    expect(hasFiled("found")).toBe(false);
    expect(hasFiled("connected")).toBe(false);
    expect(hasFiled("lost")).toBe(false);
  });
});

describe("needsContactCadence", () => {
  it("excludes only lost", () => {
    expect(needsContactCadence("lost")).toBe(false);
    for (const stage of ["found", "connected", "filed", "won"] as const) {
      expect(needsContactCadence(stage)).toBe(true);
    }
  });
});

describe("contactCadenceDays", () => {
  it("is weekly before filing", () => {
    expect(contactCadenceDays("found")).toBe(WEEKLY_CONTACT_DAYS);
    expect(contactCadenceDays("connected")).toBe(WEEKLY_CONTACT_DAYS);
  });

  it("is monthly once filed", () => {
    expect(contactCadenceDays("filed")).toBe(MONTHLY_CONTACT_DAYS);
    expect(contactCadenceDays("won")).toBe(MONTHLY_CONTACT_DAYS);
  });
});

describe("contactDueDate", () => {
  it("is a week after last contact when not yet filed", () => {
    const lastContactedAt = new Date("2026-01-01T00:00:00Z");
    const due = contactDueDate({
      pipelineStage: "connected",
      lastContactedAt,
      createdAt: new Date("2025-12-01T00:00:00Z"),
    });
    expect(due.toISOString()).toBe("2026-01-08T00:00:00.000Z");
  });

  it("is a month after last contact once filed", () => {
    const lastContactedAt = new Date("2026-01-01T00:00:00Z");
    const due = contactDueDate({
      pipelineStage: "filed",
      lastContactedAt,
      createdAt: new Date("2025-12-01T00:00:00Z"),
    });
    expect(due.toISOString()).toBe("2026-01-31T00:00:00.000Z");
  });

  it("falls back to createdAt when nobody has logged contact yet", () => {
    const createdAt = new Date("2026-01-01T00:00:00Z");
    const due = contactDueDate({
      pipelineStage: "found",
      lastContactedAt: null,
      createdAt,
    });
    expect(due.toISOString()).toBe("2026-01-08T00:00:00.000Z");
  });
});
