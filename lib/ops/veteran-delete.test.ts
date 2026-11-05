import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeFirestore, veteranDoc } from "@/lib/__tests__/fake-firestore";

vi.mock("server-only", () => ({}));
const db = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("@/lib/firebase/admin", () => ({
  get adminDb() {
    return db.current;
  },
}));
const logAudit = vi.fn<(entry: unknown) => Promise<void>>(async () => {});
vi.mock("@/lib/audit", () => ({ logAudit: (e: unknown) => logAudit(e) }));

const admin = { uid: "admin1", email: "admin@wtw.org" };

let fake: ReturnType<typeof fakeFirestore>;
beforeEach(() => {
  fake = fakeFirestore({
    veterans: { v1: veteranDoc(), v2: veteranDoc({ firstName: "Ana" }) },
  });
  db.current = fake.adminDb;
  logAudit.mockClear();
});

describe("softDeleteVeteran", () => {
  it("stamps deletedAt and deletedBy and keeps the record", async () => {
    const { softDeleteVeteran } = await import("./veteran-delete");
    const result = await softDeleteVeteran(admin, "v1");
    expect(result).toEqual({ ok: true });

    const doc = fake.col("veterans").get("v1")!;
    expect(doc).toBeDefined();
    expect(doc.firstName).toBe("Sam");
    expect(doc.deletedAt).toBeInstanceOf(Date);
    expect(doc.deletedBy).toBe("admin1");
    // The other veteran is untouched.
    expect(fake.col("veterans").get("v2")!.deletedAt).toBeUndefined();
  });

  it("writes a delete audit entry", async () => {
    const { softDeleteVeteran } = await import("./veteran-delete");
    await softDeleteVeteran(admin, "v1");
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "delete",
        resourceType: "veteran",
        resourceId: "v1",
        diff: expect.objectContaining({
          deletedBy: { before: null, after: "admin1" },
        }),
      }),
    );
  });

  it("refuses a missing or already-deleted veteran", async () => {
    const { softDeleteVeteran } = await import("./veteran-delete");
    expect(await softDeleteVeteran(admin, "nope")).toEqual({
      ok: false,
      error: "Veteran not found.",
    });
    await softDeleteVeteran(admin, "v1");
    expect((await softDeleteVeteran(admin, "v1")).ok).toBe(false);
  });
});

describe("restoreVeteran", () => {
  it("clears deletedAt and deletedBy and logs it", async () => {
    const { restoreVeteran, softDeleteVeteran } = await import("./veteran-delete");
    await softDeleteVeteran(admin, "v1");
    logAudit.mockClear();

    expect(await restoreVeteran(admin, "v1")).toEqual({ ok: true });
    const doc = fake.col("veterans").get("v1")!;
    expect(doc.deletedAt).toBeNull();
    expect(doc.deletedBy).toBeNull();
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "update", resourceId: "v1" }),
    );
  });

  it("refuses a veteran that isn't deleted", async () => {
    const { restoreVeteran } = await import("./veteran-delete");
    expect(await restoreVeteran(admin, "v2")).toEqual({
      ok: false,
      error: "This veteran isn't deleted.",
    });
  });
});
