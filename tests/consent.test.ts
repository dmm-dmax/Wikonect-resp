import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, schema } from "@/server/db";
import { createInvitation, registerPatient } from "@/server/invitation";
import { activeConsents, hasRequiredConsents, revokeConsent } from "@/server/consent";
import { purgeExpiredSessions } from "@/server/retention";
import { verifyAuditChain } from "@/server/audit";
import { PW, seedDoctor, seedPatient, uniq } from "./helpers";

describe("Einladung und Einwilligung", () => {
  it("ohne Pflichteinwilligung entstehen weder Konto noch Sitzung", async () => {
    const d = await seedDoctor();
    const inv = await createInvitation(d.doctorId, new Date(Date.now() + 86400_000));
    const email = `${uniq("x")}@example.test`;
    const r = await registerPatient({ token: inv.token, email, password: PW, consents: ["dialog"] });
    expect(r.ok).toBe(false);
    const rows = await db().select().from(schema.patient).where(eq(schema.patient.email, email));
    expect(rows).toHaveLength(0);
    // Einladung bleibt nutzbar
    const again = await registerPatient({ token: inv.token, email, password: PW, consents: ["dialog", "ai_processing"] });
    expect(again.ok).toBe(true);
  });
  it("Einladung ist einmalig nutzbar", async () => {
    const p = await seedPatient();
    const r = await registerPatient({ token: p.token, email: `${uniq("y")}@example.test`, password: PW, consents: ["dialog", "ai_processing"] });
    expect(r.ok).toBe(false);
  });
  it("abgelaufene Einladung wird abgelehnt", async () => {
    const d = await seedDoctor();
    const inv = await createInvitation(d.doctorId, new Date(Date.now() + 86400_000));
    await db().update(schema.invitation).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(schema.invitation.id, inv.id));
    const r = await registerPatient({ token: inv.token, email: `${uniq("z")}@example.test`, password: PW, consents: ["dialog", "ai_processing"] });
    expect(r.ok).toBe(false);
  });
  it("schwaches Passwort wird abgelehnt", async () => {
    const d = await seedDoctor();
    const inv = await createInvitation(d.doctorId, new Date(Date.now() + 86400_000));
    const r = await registerPatient({ token: inv.token, email: `${uniq("w")}@example.test`, password: "kurz", consents: ["dialog", "ai_processing"] });
    expect(r.ok).toBe(false);
  });
  it("speichert Einwilligung versioniert; upload ist optional", async () => {
    const p = await seedPatient({ consents: ["dialog", "ai_processing"] });
    expect(await hasRequiredConsents(p.patientId)).toBe(true);
    expect((await activeConsents(p.patientId)).has("upload")).toBe(false);
  });
});

describe("Widerruf und Löschung", () => {
  it("Widerruf der KI-Einwilligung löscht Sitzungsdaten sofort", async () => {
    const p = await seedPatient();
    const [c] = await db().insert(schema.complaint).values({ sessionId: p.sessionId, region: "thorax", labelPatientEnc: "enc" }).returning();
    await db().insert(schema.message).values({ sessionId: p.sessionId, role: "patient", contentEnc: "enc" });
    await db().insert(schema.entry).values({ complaintId: c!.id, field: "lokalisation", patientQuoteEnc: "enc", source: "DIALOG" });
    await revokeConsent(p.patientId, "ai_processing");
    expect(await hasRequiredConsents(p.patientId)).toBe(false);
    expect(await db().select().from(schema.message).where(eq(schema.message.sessionId, p.sessionId))).toHaveLength(0);
    expect(await db().select().from(schema.complaint).where(eq(schema.complaint.sessionId, p.sessionId))).toHaveLength(0);
    const [s] = await db().select().from(schema.anamnesisSession).where(eq(schema.anamnesisSession.id, p.sessionId));
    expect(s!.status).toBe("DELETED");
  });
  it("Aufbewahrungsfrist: abgelaufene Sitzungen werden gelöscht, andere nicht", async () => {
    const old = await seedPatient();
    const fresh = await seedPatient();
    await db().update(schema.anamnesisSession).set({ deleteAfter: new Date(Date.now() - 1000) }).where(eq(schema.anamnesisSession.id, old.sessionId));
    await purgeExpiredSessions();
    const [a] = await db().select().from(schema.anamnesisSession).where(eq(schema.anamnesisSession.id, old.sessionId));
    const [b] = await db().select().from(schema.anamnesisSession).where(eq(schema.anamnesisSession.id, fresh.sessionId));
    expect(a!.status).toBe("DELETED");
    expect(b!.status).toBe("OPEN");
  });
  it("Audit-Kette bleibt nach allen Vorgängen intakt", async () => {
    expect((await verifyAuditChain()).ok).toBe(true);
  });
});
