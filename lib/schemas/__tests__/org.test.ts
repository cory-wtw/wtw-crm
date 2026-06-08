import { describe, expect, it } from "vitest";
import {
  ORG_CATEGORIES,
  ORG_RELATIONSHIP_STATUSES,
  orgInputSchema,
} from "..";

describe("orgInputSchema", () => {
  it("requires name", () => {
    const result = orgInputSchema.safeParse({
      category: "foundation",
      relationshipStatus: "prospect",
    });
    expect(result.success).toBe(false);
  });

  it("accepts a minimal org", () => {
    const result = orgInputSchema.safeParse({
      name: "Acme Foundation",
      category: "foundation",
      relationshipStatus: "prospect",
    });
    expect(result.success).toBe(true);
  });

  it("accepts every category", () => {
    for (const category of ORG_CATEGORIES) {
      const result = orgInputSchema.safeParse({
        name: "X",
        category,
        relationshipStatus: "prospect",
      });
      expect(result.success).toBe(true);
    }
  });

  it("rejects unknown categories", () => {
    const result = orgInputSchema.safeParse({
      name: "X",
      category: "nonprofit",
      relationshipStatus: "prospect",
    });
    expect(result.success).toBe(false);
  });

  it("accepts every relationship status", () => {
    for (const status of ORG_RELATIONSHIP_STATUSES) {
      const result = orgInputSchema.safeParse({
        name: "X",
        category: "other",
        relationshipStatus: status,
      });
      expect(result.success).toBe(true);
    }
  });

  it("rejects unknown relationship statuses", () => {
    const result = orgInputSchema.safeParse({
      name: "X",
      category: "other",
      relationshipStatus: "maybe",
    });
    expect(result.success).toBe(false);
  });

  it("accepts blank primary contact email", () => {
    const result = orgInputSchema.safeParse({
      name: "X",
      category: "other",
      relationshipStatus: "prospect",
      primaryContactEmail: "",
    });
    expect(result.success).toBe(true);
  });

  it("rejects malformed primary contact email", () => {
    const result = orgInputSchema.safeParse({
      name: "X",
      category: "other",
      relationshipStatus: "prospect",
      primaryContactEmail: "not-an-email",
    });
    expect(result.success).toBe(false);
  });
});
