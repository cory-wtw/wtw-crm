import { describe, expect, it } from "vitest";
import {
  BUCKET_CODES,
  BUCKET_LABELS,
  BUCKET_PROMPTS,
  DISCHARGE_CHARACTERS,
  DISCHARGE_CHARACTER_LABELS,
  DISCHARGE_RANK,
  MIN_DISCHARGES,
  MIN_DISCHARGE_LABELS,
  MIN_DISCHARGE_RANK,
  SERVICE_ERAS,
  SERVICE_ERA_LABELS,
  bucketSchema,
} from "..";

describe("buckets", () => {
  it("has all eleven codes", () => {
    expect(BUCKET_CODES).toHaveLength(11);
  });

  it("labels and read-aloud prompts cover every code", () => {
    for (const code of BUCKET_CODES) {
      expect(BUCKET_LABELS[code]).toBeTruthy();
      expect(BUCKET_PROMPTS[code]).toBeTruthy();
    }
  });

  it("parses a known code and rejects an unknown one", () => {
    expect(bucketSchema.safeParse("housing").success).toBe(true);
    expect(bucketSchema.safeParse("hosuing").success).toBe(false);
  });
});

describe("service eras", () => {
  it("labels every era", () => {
    for (const era of SERVICE_ERAS) {
      expect(SERVICE_ERA_LABELS[era]).toBeTruthy();
    }
  });
});

describe("discharge ranking", () => {
  it("labels every value on both sides", () => {
    for (const value of DISCHARGE_CHARACTERS) {
      expect(DISCHARGE_CHARACTER_LABELS[value]).toBeTruthy();
    }
    for (const value of MIN_DISCHARGES) {
      expect(MIN_DISCHARGE_LABELS[value]).toBeTruthy();
    }
  });

  it("treats an unknown discharge as other-than-honorable, so it fails closed", () => {
    expect(DISCHARGE_RANK.unsure).toBe(DISCHARGE_RANK.other);
    // An "honorable only" resource must not admit an unsure veteran.
    expect(DISCHARGE_RANK.unsure).toBeLessThan(MIN_DISCHARGE_RANK.honorable);
  });

  it("is inclusive upward", () => {
    // any accepts everyone, including other-than-honorable
    for (const value of DISCHARGE_CHARACTERS) {
      expect(DISCHARGE_RANK[value]).toBeGreaterThanOrEqual(
        MIN_DISCHARGE_RANK.any,
      );
    }
    // general accepts general and honorable but not other
    expect(DISCHARGE_RANK.general).toBeGreaterThanOrEqual(
      MIN_DISCHARGE_RANK.general,
    );
    expect(DISCHARGE_RANK.honorable).toBeGreaterThanOrEqual(
      MIN_DISCHARGE_RANK.general,
    );
    expect(DISCHARGE_RANK.other).toBeLessThan(MIN_DISCHARGE_RANK.general);
    // honorable only accepts honorable
    expect(DISCHARGE_RANK.honorable).toBeGreaterThanOrEqual(
      MIN_DISCHARGE_RANK.honorable,
    );
    expect(DISCHARGE_RANK.general).toBeLessThan(MIN_DISCHARGE_RANK.honorable);
  });
});
