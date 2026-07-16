import { describe, expect, it } from "vitest";
import {
  canCreateVeteran,
  canDeleteMedia,
  canDeleteVeteran,
  canEditPhone,
  canEditVeteran,
  canEditVso,
  canManageUsers,
  canMarkMediaUsed,
  canReassignVeteran,
  canUploadMedia,
  canViewAuditLog,
  canViewMedia,
  canViewVeteran,
  isAdmin,
} from "./permissions";

const ADMIN = { uid: "u-admin", role: "admin" as const };
const STANDARD_A = { uid: "u-a", role: "standard" as const };

const VET_A = { assigneeUid: "u-a" };
const VET_B = { assigneeUid: "u-b" };
const VET_UNASSIGNED = { assigneeUid: null };

describe("isAdmin", () => {
  it("recognizes admin", () => {
    expect(isAdmin(ADMIN)).toBe(true);
  });
  it("rejects standard", () => {
    expect(isAdmin(STANDARD_A)).toBe(false);
  });
  it("rejects null session", () => {
    expect(isAdmin(null)).toBe(false);
  });
});

describe("canViewVeteran / canCreateVeteran", () => {
  it("allows anyone signed in", () => {
    expect(canViewVeteran(ADMIN)).toBe(true);
    expect(canViewVeteran(STANDARD_A)).toBe(true);
    expect(canCreateVeteran(STANDARD_A)).toBe(true);
  });
  it("blocks not-signed-in", () => {
    expect(canViewVeteran(null)).toBe(false);
    expect(canCreateVeteran(null)).toBe(false);
  });
});

describe("canEditVeteran", () => {
  it("admin can edit anyone's veteran", () => {
    expect(canEditVeteran(ADMIN, VET_A)).toBe(true);
    expect(canEditVeteran(ADMIN, VET_B)).toBe(true);
    expect(canEditVeteran(ADMIN, VET_UNASSIGNED)).toBe(true);
  });
  it("standard can edit only their own", () => {
    expect(canEditVeteran(STANDARD_A, VET_A)).toBe(true);
    expect(canEditVeteran(STANDARD_A, VET_B)).toBe(false);
    expect(canEditVeteran(STANDARD_A, VET_UNASSIGNED)).toBe(false);
  });
  it("not-signed-in can edit nothing", () => {
    expect(canEditVeteran(null, VET_A)).toBe(false);
  });
});

describe("canReassignVeteran / canDeleteVeteran", () => {
  it("admin only", () => {
    expect(canReassignVeteran(ADMIN)).toBe(true);
    expect(canReassignVeteran(STANDARD_A)).toBe(false);
    expect(canDeleteVeteran(ADMIN)).toBe(true);
    expect(canDeleteVeteran(STANDARD_A)).toBe(false);
  });
});

describe("canEditVso / canEditPhone", () => {
  it("allows anyone signed in", () => {
    expect(canEditVso(ADMIN)).toBe(true);
    expect(canEditVso(STANDARD_A)).toBe(true);
    expect(canEditPhone(ADMIN)).toBe(true);
    expect(canEditPhone(STANDARD_A)).toBe(true);
  });
  it("blocks not-signed-in", () => {
    expect(canEditVso(null)).toBe(false);
    expect(canEditPhone(null)).toBe(false);
  });
});

describe("canManageUsers / canViewAuditLog", () => {
  it("admin only", () => {
    expect(canManageUsers(ADMIN)).toBe(true);
    expect(canManageUsers(STANDARD_A)).toBe(false);
    expect(canViewAuditLog(ADMIN)).toBe(true);
    expect(canViewAuditLog(STANDARD_A)).toBe(false);
  });
});

describe("media permissions", () => {
  it("anyone signed in can view, upload, and mark used", () => {
    for (const s of [ADMIN, STANDARD_A]) {
      expect(canViewMedia(s)).toBe(true);
      expect(canUploadMedia(s)).toBe(true);
      expect(canMarkMediaUsed(s)).toBe(true);
    }
  });

  it("not-signed-in can do none of it", () => {
    expect(canViewMedia(null)).toBe(false);
    expect(canUploadMedia(null)).toBe(false);
    expect(canMarkMediaUsed(null)).toBe(false);
  });

  it("uploader can delete their own media", () => {
    expect(canDeleteMedia(STANDARD_A, { createdBy: "u-a" })).toBe(true);
  });

  it("standard user cannot delete someone else's media", () => {
    expect(canDeleteMedia(STANDARD_A, { createdBy: "u-b" })).toBe(false);
  });

  it("admin can delete anyone's media", () => {
    expect(canDeleteMedia(ADMIN, { createdBy: "u-b" })).toBe(true);
  });

  it("not-signed-in cannot delete media", () => {
    expect(canDeleteMedia(null, { createdBy: "u-a" })).toBe(false);
  });
});
