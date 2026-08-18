import { describe, expect, it } from "vitest";
import {
  canAccessCrm,
  canCreateVeteran,
  canDeleteMedia,
  canDeleteVeteran,
  canEditMedia,
  canEditPhone,
  canEditVeteran,
  canCreateReferral,
  canRunIntake,
  canEditVso,
  canManageUsers,
  canMarkMediaUsed,
  canReassignVeteran,
  canUploadMedia,
  canViewAuditLog,
  canViewMedia,
  canViewVeteran,
  isAdmin,
  isSocialOnly,
  isSocialPath,
} from "./permissions";

const ADMIN = { uid: "u-admin", role: "admin" as const };
const STANDARD_A = { uid: "u-a", role: "standard" as const };
const SOCIAL = { uid: "u-social", role: "social" as const };

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

describe("social role", () => {
  it("isSocialOnly recognizes only the social role", () => {
    expect(isSocialOnly(SOCIAL)).toBe(true);
    expect(isSocialOnly(ADMIN)).toBe(false);
    expect(isSocialOnly(STANDARD_A)).toBe(false);
    expect(isSocialOnly(null)).toBe(false);
  });

  it("canAccessCrm is true for admin/standard, false for social/null", () => {
    expect(canAccessCrm(ADMIN)).toBe(true);
    expect(canAccessCrm(STANDARD_A)).toBe(true);
    expect(canAccessCrm(SOCIAL)).toBe(false);
    expect(canAccessCrm(null)).toBe(false);
  });

  it("social users are locked out of all CRM data", () => {
    expect(canViewVeteran(SOCIAL)).toBe(false);
    expect(canCreateVeteran(SOCIAL)).toBe(false);
    expect(canEditVeteran(SOCIAL, VET_A)).toBe(false);
    expect(canEditVso(SOCIAL)).toBe(false);
    expect(canEditPhone(SOCIAL)).toBe(false);
    expect(canManageUsers(SOCIAL)).toBe(false);
    expect(canViewAuditLog(SOCIAL)).toBe(false);
    expect(canReassignVeteran(SOCIAL)).toBe(false);
    expect(canDeleteVeteran(SOCIAL)).toBe(false);
  });

  it("social users keep full access to the media wall", () => {
    expect(canViewMedia(SOCIAL)).toBe(true);
    expect(canUploadMedia(SOCIAL)).toBe(true);
    expect(canMarkMediaUsed(SOCIAL)).toBe(true);
    expect(canDeleteMedia(SOCIAL, { createdBy: "u-social" })).toBe(true);
    expect(canDeleteMedia(SOCIAL, { createdBy: "u-other" })).toBe(false);
    expect(canEditMedia(SOCIAL, { createdBy: "u-social" })).toBe(true);
    expect(canEditMedia(SOCIAL, { createdBy: "u-other" })).toBe(false);
  });
});

describe("canEditMedia", () => {
  it("lets the uploader edit their own item", () => {
    expect(canEditMedia(STANDARD_A, { createdBy: "u-a" })).toBe(true);
  });
  it("blocks editing someone else's item", () => {
    expect(canEditMedia(STANDARD_A, { createdBy: "u-b" })).toBe(false);
  });
  it("lets an admin edit anything", () => {
    expect(canEditMedia(ADMIN, { createdBy: "u-b" })).toBe(true);
  });
  it("blocks not-signed-in", () => {
    expect(canEditMedia(null, { createdBy: "u-a" })).toBe(false);
  });
});

describe("isSocialPath", () => {
  it("matches the social section", () => {
    expect(isSocialPath("/social")).toBe(true);
    expect(isSocialPath("/social/new")).toBe(true);
    expect(isSocialPath("/social/anything/deep")).toBe(true);
  });
  it("rejects everything else", () => {
    expect(isSocialPath("/")).toBe(false);
    expect(isSocialPath("/veterans")).toBe(false);
    expect(isSocialPath("/socialite")).toBe(false);
    expect(isSocialPath("/admin/users")).toBe(false);
  });
});

describe("media permissions", () => {
  it("anyone signed in can view, upload, and mark used", () => {
    for (const s of [ADMIN, STANDARD_A, SOCIAL]) {
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

describe("canRunIntake", () => {
  it("tracks canEditVeteran exactly", () => {
    const mine = { assigneeUid: "u-a" };
    const theirs = { assigneeUid: "u-b" };
    const unassigned = { assigneeUid: null };

    for (const veteran of [mine, theirs, unassigned]) {
      for (const session of [ADMIN, STANDARD_A, SOCIAL, null]) {
        expect(canRunIntake(session, veteran)).toBe(
          canEditVeteran(session, veteran),
        );
      }
    }
  });

  it("lets an admin run intake on anyone", () => {
    expect(canRunIntake(ADMIN, { assigneeUid: "u-b" })).toBe(true);
  });

  it("lets a standard user run intake only on their own", () => {
    expect(canRunIntake(STANDARD_A, { assigneeUid: "u-a" })).toBe(true);
    expect(canRunIntake(STANDARD_A, { assigneeUid: "u-b" })).toBe(false);
  });

  it("keeps social-only users out", () => {
    expect(canRunIntake(SOCIAL, { assigneeUid: "u-a" })).toBe(false);
  });
});

describe("canCreateReferral", () => {
  it("tracks canEditVeteran exactly", () => {
    for (const veteran of [
      { assigneeUid: "u-a" },
      { assigneeUid: "u-b" },
      { assigneeUid: null },
    ]) {
      for (const session of [ADMIN, STANDARD_A, SOCIAL, null]) {
        expect(canCreateReferral(session, veteran)).toBe(
          canEditVeteran(session, veteran),
        );
      }
    }
  });

  it("keeps a standard user off someone else's veteran", () => {
    expect(canCreateReferral(STANDARD_A, { assigneeUid: "u-b" })).toBe(false);
  });

  it("keeps social-only users out entirely", () => {
    expect(canCreateReferral(SOCIAL, { assigneeUid: "u-a" })).toBe(false);
  });
});
