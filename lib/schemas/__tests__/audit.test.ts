import { describe, expect, it } from "vitest";
import {
  AUDIT_ACTIONS,
  AUDIT_ACTION_LABELS,
  RESOURCE_TYPES,
  RESOURCE_TYPE_LABELS,
  auditLogSchema,
} from "..";

describe("audit label completeness", () => {
  it("has a label for every action", () => {
    for (const action of AUDIT_ACTIONS) {
      expect(AUDIT_ACTION_LABELS[action]).toBeTruthy();
    }
    expect(Object.keys(AUDIT_ACTION_LABELS).sort()).toEqual(
      [...AUDIT_ACTIONS].sort(),
    );
  });

  it("has a label for every resource type", () => {
    for (const type of RESOURCE_TYPES) {
      expect(RESOURCE_TYPE_LABELS[type]).toBeTruthy();
    }
    expect(Object.keys(RESOURCE_TYPE_LABELS).sort()).toEqual(
      [...RESOURCE_TYPES].sort(),
    );
  });

  it("covers the media resource type", () => {
    expect(RESOURCE_TYPES).toContain("media");
    expect(RESOURCE_TYPE_LABELS.media).toBe("Media");
  });
});

describe("auditLogSchema", () => {
  it("accepts a well-formed entry", () => {
    const result = auditLogSchema.safeParse({
      id: "a1",
      actorUid: "u1",
      actorEmail: "u1@example.com",
      action: "delete",
      resourceType: "media",
      resourceId: "m1",
      at: new Date(),
    });
    expect(result.success).toBe(true);
  });

  it("rejects an unknown resource type", () => {
    const result = auditLogSchema.safeParse({
      id: "a1",
      actorUid: "u1",
      actorEmail: "u1@example.com",
      action: "delete",
      resourceType: "spaceship",
      resourceId: "m1",
      at: new Date(),
    });
    expect(result.success).toBe(false);
  });
});
