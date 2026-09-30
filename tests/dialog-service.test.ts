import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, schema } from "@/server/db";
import { getDialogView, handlePatientMessage, submitSession } from "@/server/dialog/service";
import { revokeConsent } from "@/server/consent";
import { DEFLECT_ANSWER } from "@/server/dialog/deflect";
import { verifyAuditChain } from "@/server/audit";
import { seedPatient } from "./helpers";

async function say(p: { sessionId: string; patientId: string }, text: string) {
  const r = await handlePatientMessage(p.sessionId, p.patientId, text);
  expect(r.kind, JSON.stringify(r)).toBe("ok");
}

async function completeDialog(p: { sessionId: string; patientId: string }) {
  await say(p, "Seit 3 Tagen Kopfschmerzen links, stechend, 6/10");
  for (let i = 0; i < 30; i++) {
    const v = await getDialogView(p.sessionId, p.patientId);
    if (v!.step === "review") return v!;
    const last = v!.messages.at(-1)!.text;
    if (last.startsWith("Haben Sie noch weitere")) await say(p, "nein");
    else if (/Vorerkrankungen/.test(last)) await say(p, "Ich habe Bluthochdruck");
    else if (/Medikamente/.test(last)) await say(p, "Ramipril 5 mg morgens");
    else if (/Allergien/.test(last)) await say(p, "nein");
    else await say(p, "weiß nicht");
  }
  throw new Error("Dialog endet nicht");
}

describe("Dialog-Service (Mock-KI, echte DB)", () => {
  it("führt von der Erstbeschreibung bis zur Prüfung und Abgabe", async () => {
    const p = await seedPatient();
    const v0 = await getDialogView(p.sessionId, p.patientId);
    expect(v0!.messages[0]!.role).toBe("assistant");
    expect(v0!.progress).toBe(0);
    const v = await completeDialog(p);
    expect(v.progress).toBeGreaterThan(90);
    expect(v.review.length).toBeGreaterThanOrEqual(2);
    expect((await submitSession(p.sessionId, p.patientId)).ok).toBe(true);
    const done = await getDialogView(p.sessionId, p.patientId);
    expect(done!.status).toBe("SUBMITTED");
    expect(done!.progress).toBe(100);
    expect((await handlePatientMessage(p.sessionId, p.patientId, "noch etwas")).kind).toBe("error");
  });

  it("Einträge enthalten Zitat, Fachterm und Quelle; Erstbeschreibung füllt Felder vor", async () => {
    const p = await seedPatient();
    await say(p, "Seit 3 Tagen Kopfschmerzen links, stechend, 6/10");
    const comps = await db().select().from(schema.complaint).where(eq(schema.complaint.sessionId, p.sessionId));
    expect(comps).toHaveLength(1);
    const es = await db().select().from(schema.entry).where(eq(schema.entry.complaintId, comps[0]!.id));
    const fields = es.map((e) => e.field).sort();
    expect(fields).toEqual(expect.arrayContaining(["beginn", "intensitaet", "qualitaet", "lokalisation"]));
    expect(es.every((e) => e.source === "DIALOG" && e.promptVersion === "extract-complaints@v1")).toBe(true);
    // Folgefrage überspringt gefüllte Felder
    const v = await getDialogView(p.sessionId, p.patientId);
    expect(v!.messages.at(-1)!.text).toMatch(/Wie lange dauert/);
  });

  it("'Was habe ich?' → feste Antwort, Frage bleibt, kein Fortschritt", async () => {
    const p = await seedPatient();
    await say(p, "Seit 3 Tagen Kopfschmerzen");
    const before = await getDialogView(p.sessionId, p.patientId);
    const r = await handlePatientMessage(p.sessionId, p.patientId, "Was habe ich?");
    expect(r.kind).toBe("deflected");
    const after = await getDialogView(p.sessionId, p.patientId);
    expect(after!.messages.some((m) => m.text === DEFLECT_ANSWER)).toBe(true);
    expect(after!.progress).toBe(before!.progress);
    expect(after!.messages.at(-1)!.text).toBe(before!.messages.at(-1)!.text);
  });

  it("Notfall bricht ab, verwirft Inhalte, zeigt 112 und nimmt keine Eingabe mehr an", async () => {
    const p = await seedPatient();
    await say(p, "Seit 3 Tagen Kopfschmerzen");
    const r = await handlePatientMessage(p.sessionId, p.patientId, "Ich habe jetzt Brustschmerzen und Atemnot");
    expect(r.kind).toBe("emergency");
    if (r.kind === "emergency") expect(r.response.lines.join(" ")).toContain("112");
    const v = await getDialogView(p.sessionId, p.patientId);
    expect(v!.status).toBe("ABORTED_EMERGENCY");
    expect(v!.emergency?.lines.join(" ")).toContain("112");
    expect(v!.messages).toHaveLength(0);
    expect(await db().select().from(schema.complaint).where(eq(schema.complaint.sessionId, p.sessionId))).toHaveLength(0);
    expect((await handlePatientMessage(p.sessionId, p.patientId, "hallo")).kind).toBe("error");
  });

  it("Suizidalität zeigt Hilfsangebote (Telefonseelsorge)", async () => {
    const p = await seedPatient();
    const r = await handlePatientMessage(p.sessionId, p.patientId, "Ich will nicht mehr leben");
    expect(r.kind).toBe("emergency");
    const v = await getDialogView(p.sessionId, p.patientId);
    expect(v!.emergency?.lines.join(" ")).toContain("0800 111 0 111");
  });

  it("Notfall-Text landet weder in Nachrichten noch im Audit-Log", async () => {
    const p = await seedPatient();
    await handlePatientMessage(p.sessionId, p.patientId, "Lähmung im Arm");
    expect(await db().select().from(schema.message).where(eq(schema.message.sessionId, p.sessionId))).toHaveLength(0);
    const logs = await db().select().from(schema.auditLog).where(eq(schema.auditLog.objectId, p.sessionId));
    expect(logs.some((l) => l.action.startsWith("dialog.emergency_abort.laehmung"))).toBe(true);
    expect(JSON.stringify(logs)).not.toContain("Arm");
  });

  it("Gesundheitsdaten liegen verschlüsselt in der DB", async () => {
    const p = await seedPatient();
    await say(p, "Seit 3 Tagen Kopfschmerzen links, stechend");
    const msgs = await db().select().from(schema.message).where(eq(schema.message.sessionId, p.sessionId));
    const comps = await db().select().from(schema.complaint).where(eq(schema.complaint.sessionId, p.sessionId));
    const es = await db().select().from(schema.entry).where(eq(schema.entry.complaintId, comps[0]!.id));
    const dump = JSON.stringify([msgs, comps, es]);
    expect(dump).not.toMatch(/Kopfschmerz|stechend|Kephalgie/);
  });

  it("Audit-Log enthält keine Dialoginhalte", async () => {
    const p = await seedPatient();
    await say(p, "Seit 3 Tagen Kopfschmerzen links");
    const logs = await db().select().from(schema.auditLog).where(eq(schema.auditLog.objectId, p.sessionId));
    expect(logs.length).toBeGreaterThan(0);
    expect(JSON.stringify(logs)).not.toMatch(/Kopf/);
    expect((await verifyAuditChain()).ok).toBe(true);
  });

  it("fremder Patient hat keinen Zugriff", async () => {
    const a = await seedPatient();
    const b = await seedPatient();
    expect(await getDialogView(a.sessionId, b.patientId)).toBeNull();
    expect((await handlePatientMessage(a.sessionId, b.patientId, "hallo")).kind).toBe("error");
    expect((await submitSession(a.sessionId, b.patientId)).ok).toBe(false);
  });

  it("ohne Einwilligung kein Dialog", async () => {
    const p = await seedPatient();
    await revokeConsent(p.patientId, "ai_processing");
    expect((await handlePatientMessage(p.sessionId, p.patientId, "hallo")).kind).toBe("error");
  });

  it("Abgabe vor Abschluss wird abgelehnt", async () => {
    const p = await seedPatient();
    await say(p, "Kopfschmerzen");
    expect((await submitSession(p.sessionId, p.patientId)).ok).toBe(false);
  });

  it("entfernt Telefonnummern und E-Mail vor Speicherung", async () => {
    const p = await seedPatient();
    await say(p, "Kopfschmerzen, erreichbar unter max@beispiel.test oder 0611 1234567");
    const v = await getDialogView(p.sessionId, p.patientId);
    const patientMsg = v!.messages.find((m) => m.role === "patient")!.text;
    expect(patientMsg).not.toMatch(/beispiel\.test|1234567/);
  });

  it("Eigen-Diagnose des Patienten wird nicht in die Folgefrage gespiegelt", async () => {
    const p = await seedPatient();
    await say(p, "Ich habe einen Herzinfarkt");
    const v = await getDialogView(p.sessionId, p.patientId);
    expect(v!.messages.at(-1)!.text.toLowerCase()).not.toContain("infarkt");
  });
});
