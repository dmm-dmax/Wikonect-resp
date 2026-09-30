import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@/server/db";
import { audit, verifyAuditChain } from "@/server/audit";

describe("Audit-Log", () => {
  it("schreibt eine verifizierbare Hash-Kette", async () => {
    await audit({ actorType: "system", action: "test.a" });
    await audit({ actorType: "doctor", actorId: "x", action: "test.b", objectType: "t", objectId: "1" });
    expect((await verifyAuditChain()).ok).toBe(true);
  });
  it("ist append-only (UPDATE/DELETE/TRUNCATE werden verweigert)", async () => {
    await audit({ actorType: "system", action: "test.c" });
    await expect(db().execute(sql`update audit_log set action = 'x'`)).rejects.toThrow();
    await expect(db().execute(sql`delete from audit_log`)).rejects.toThrow();
    await expect(db().execute(sql`truncate audit_log`)).rejects.toThrow();
  });
  it("parallele Schreibvorgänge halten die Kette intakt", async () => {
    await Promise.all(Array.from({ length: 8 }, (_, i) => audit({ actorType: "system", action: `test.p${i}` })));
    expect((await verifyAuditChain()).ok).toBe(true);
  });
});
