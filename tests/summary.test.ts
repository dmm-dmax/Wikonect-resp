import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, schema } from "@/server/db";
import { buildSummaryModel, type RawComplaint, type RawLab } from "@/server/summary/build";
import { createSummarySnapshot, getSummaryForDoctor } from "@/server/summary";
import { getDialogView, handlePatientMessage, submitSession } from "@/server/dialog/service";
import { uploadDocument } from "@/server/upload/service";
import { checkClinicalTerm, checkText } from "@/server/filter";
import { PNG_1X1, labPdf } from "./pdf-fixtures";
import { seedPatient } from "./helpers";

const base = { sessionId: "s1", pseudonym: "P-abc", appointmentAt: new Date("2030-01-02T09:00:00Z"), submittedAt: new Date("2030-01-01T10:00:00Z"), documents: [], patientFreeText: [] };
const complaint = (over: Partial<RawComplaint> = {}): RawComplaint => ({
  id: "c1", region: "kopf", position: 0, labelPatient: "Kopfweh", labelClinical: "Kephalgie",
  entries: [
    { field: "qualitaet", quote: "dumpf", term: "dumpf", blocked: false, source: "DIALOG", promptVersion: "extract-slot@v1", model: "m" },
    { field: "lokalisation", quote: "links", term: "links", blocked: false, source: "DIALOG", promptVersion: "extract-slot@v1", model: "m" },
    { field: "beginn", quote: "seit gestern", term: "seit gestern", blocked: false, source: "DIALOG", promptVersion: null, model: null },
  ],
  ...over,
});

describe("Zusammenfassung (deterministisch)", () => {
  it("ordnet Felder nach Anamnese-Schema und bildet eine Stichpunkt-Kopfzeile aus Fachtermen", () => {
    const m = buildSummaryModel({ ...base, complaints: [complaint()], labs: [] });
    const s = m.sections[0]!;
    expect(s.items.map((i) => i.field)).toEqual(["lokalisation", "beginn", "qualitaet"]);
    expect(s.headline).toBe("Kephalgie · Lokalisation: links · Beginn: seit gestern · Qualität: dumpf");
    expect(s.title).toBe("Kephalgie");
    expect(s.patientLabel).toBe("Kopfweh");
  });

  it("jeder Eintrag hat Originalaussage und Quelle", () => {
    const m = buildSummaryModel({ ...base, complaints: [complaint()], labs: [] });
    for (const i of m.sections.flatMap((s) => s.items)) {
      expect(i.patientQuote.length).toBeGreaterThan(0);
      expect(i.source.kind).toBe("DIALOG");
      expect(i.fieldLabel.length).toBeGreaterThan(0);
    }
  });

  it("Filter greift auch hier: Krankheitsname im Term wird entfernt, Zitat bleibt", () => {
    const c = complaint({ entries: [{ field: "qualitaet", quote: "Stechen links", term: "Myokardinfarkt", blocked: false, source: "DIALOG", promptVersion: null, model: null }] });
    const m = buildSummaryModel({ ...base, complaints: [c], labs: [] });
    const i = m.sections[0]!.items[0]!;
    expect(i.clinicalTerm).toBeNull();
    expect(i.translationBlocked).toBe(true);
    expect(i.patientQuote).toBe("Stechen links");
    expect(m.sections[0]!.headline).not.toMatch(/infarkt/i);
  });

  it("Fachlabel mit Diagnose wird nicht als Titel verwendet", () => {
    const m = buildSummaryModel({ ...base, complaints: [complaint({ labelClinical: "Verdacht auf Migräne" })], labs: [] });
    expect(m.sections[0]!.title).toBe("Kopfweh");
  });

  it("Vorerkrankungen dürfen Patienten-Diagnosen nennen, stehen im Abschnitt Allgemeine Anamnese", () => {
    const g: RawComplaint = {
      id: "g", region: "anamnese_allgemein", position: 999, labelPatient: "Allgemeine Anamnese", labelClinical: null,
      entries: [
        { field: "allergien", quote: "nein", term: "keine Allergien angegeben", blocked: false, source: "DIALOG", promptVersion: null, model: null },
        { field: "vorerkrankungen", quote: "Bluthochdruck", term: "arterielle Hypertonie (Patientenangabe)", blocked: false, source: "DIALOG", promptVersion: null, model: null },
      ],
    };
    const m = buildSummaryModel({ ...base, complaints: [complaint(), g], labs: [] });
    const gen = m.sections.find((s) => s.kind === "general")!;
    expect(gen.items.map((i) => i.field)).toEqual(["vorerkrankungen", "allergien"]);
    expect(gen.items[0]!.clinicalTerm).toContain("Hypertonie");
  });

  it("Laborwerte: Quelle Dokument+Seite, Zuordnung sichtbar, Rest unter 'ohne Zuordnung'", () => {
    const lab = (over: Partial<RawLab>): RawLab => ({
      documentId: "d1", page: 1, complaintId: null, nameAsPrinted: "CRP", canonicalName: "CRP", value: "12,4", unit: "mg/l",
      refRangeAsPrinted: "< 5,0", line: "CRP 12,4 mg/l < 5,0", assignedBy: null, mappingRuleId: null, ...over,
    });
    const docs = [{ id: "d1", filename: "labor.pdf", kind: "PDF" as const, mime: "application/pdf", note: null, text: null, complaintId: null }];
    const m = buildSummaryModel({ ...base, documents: docs, complaints: [complaint()], labs: [lab({}), lab({ nameAsPrinted: "Troponin", canonicalName: "Troponin", complaintId: "c1", assignedBy: "RULE", mappingRuleId: "lab-mapping-v1:troponin" })] });
    expect(m.sections[0]!.labs[0]).toMatchObject({ nameAsPrinted: "Troponin", assignedBy: "RULE", source: { kind: "DOCUMENT", filename: "labor.pdf", page: 1 } });
    const loose = m.sections.find((s) => s.kind === "unassigned")!;
    expect(loose.labs).toHaveLength(1);
    expect(loose.attachments).toEqual(["d1"]);
    // Keine Wertungsfelder im Modell
    expect(JSON.stringify(m)).not.toMatch(/"(flag|abnormal|interpretation|severity|urgency)"/i);
  });

  it("ist deterministisch", () => {
    const a = buildSummaryModel({ ...base, complaints: [complaint()], labs: [] });
    const b = buildSummaryModel({ ...base, complaints: [complaint()], labs: [] });
    expect(a).toEqual(b);
  });

  it("Zusammenfassung enthält keine Bewertungssprache (Kopfzeilen, Fachterme)", () => {
    const m = buildSummaryModel({ ...base, complaints: [complaint()], labs: [] });
    for (const s of m.sections) {
      expect(checkText(s.headline)).toEqual([]);
      for (const i of s.items) if (i.clinicalTerm) expect(checkClinicalTerm(i.clinicalTerm, i.field)).toEqual([]);
    }
  });
});

async function finish(p: { sessionId: string; patientId: string }) {
  await handlePatientMessage(p.sessionId, p.patientId, "Seit 3 Tagen Kopfschmerzen links, stechend, 6/10");
  for (let i = 0; i < 30; i++) {
    const v = (await getDialogView(p.sessionId, p.patientId))!;
    if (v.step === "review") return;
    const last = v.messages.at(-1)!.text;
    const answer = last.startsWith("Haben Sie noch weitere") ? "nein" : /Vorerkrankungen/.test(last) ? "Ich habe Bluthochdruck" : /Medikamente/.test(last) ? "Ramipril 5 mg" : /Allergien/.test(last) ? "nein" : "weiß nicht";
    await handlePatientMessage(p.sessionId, p.patientId, answer);
  }
  throw new Error("Dialog endet nicht");
}

describe("Arztansicht End-to-End (Dialog + Upload + Abgabe)", () => {
  it("liefert Snapshot mit Zitat, Fachsprache, Quelle, Laborwerten und Anhängen", async () => {
    const p = await seedPatient();
    await handlePatientMessage(p.sessionId, p.patientId, "Seit 3 Tagen Kopfschmerzen links, stechend, 6/10");
    const up = await uploadDocument({ sessionId: p.sessionId, patientId: p.patientId, filename: "labor.pdf", declaredMime: "application/pdf", bytes: await labPdf([["Kreatinin", "0,9", "mg/dl", "0,7 - 1,2"], ["CRP", "12,4", "mg/l", "< 5,0"]]) });
    const img = await uploadDocument({ sessionId: p.sessionId, patientId: p.patientId, filename: "roentgen.png", declaredMime: "image/png", bytes: PNG_1X1 });
    if (!up.ok || !img.ok) throw new Error("upload");
    await finish(p);
    expect(await getSummaryForDoctor(p.sessionId, p.doctorId)).toBeNull(); // noch nicht abgesendet
    expect((await submitSession(p.sessionId, p.patientId)).ok).toBe(true);

    const m = (await getSummaryForDoctor(p.sessionId, p.doctorId))!;
    expect(m.pseudonym).toMatch(/^P-/);
    const head = m.sections.find((s) => s.kind === "complaint")!;
    expect(head.title).toBe("Kephalgie");
    expect(head.items.find((i) => i.field === "qualitaet")).toMatchObject({ clinicalTerm: "stechend", patientQuote: "stechend", source: { kind: "DIALOG" }, promptVersion: "extract-complaints@v1" });
    expect(head.items.find((i) => i.field === "intensitaet")!.clinicalTerm).toBe("NRS 6/10");
    expect(m.patientFreeText[0]).toContain("Kopfschmerzen links");
    const labs = m.sections.flatMap((s) => s.labs);
    expect(labs.map((l) => l.nameAsPrinted).sort()).toEqual(["CRP", "Kreatinin"]);
    expect(labs.every((l) => l.source.kind === "DOCUMENT" && l.line.length > 0)).toBe(true);
    expect(m.documents.map((d) => d.kind).sort()).toEqual(["IMAGE", "PDF"]);
    const loose = m.sections.find((s) => s.kind === "unassigned")!;
    expect(loose.attachments).toHaveLength(2);
    const gen = m.sections.find((s) => s.kind === "general")!;
    expect(gen.items.find((i) => i.field === "vorerkrankungen")!.clinicalTerm).toContain("Patientenangabe");
    // nichts ohne Quelle, nichts ohne Zitat
    for (const i of m.sections.flatMap((s) => s.items)) expect(i.patientQuote && i.source).toBeTruthy();
  });

  it("Snapshot liegt verschlüsselt in der DB; fremde Ärzte und offene Sitzungen haben keinen Zugriff; Zugriff wird protokolliert", async () => {
    const p = await seedPatient();
    await finish(p);
    await submitSession(p.sessionId, p.patientId);
    const snaps = await db().select().from(schema.summary).where(eq(schema.summary.sessionId, p.sessionId));
    expect(snaps).toHaveLength(1);
    expect(snaps[0]!.contentEnc).not.toMatch(/Kephalgie|Kopfschmerz/);
    const other = await seedPatient();
    expect(await getSummaryForDoctor(p.sessionId, other.doctorId)).toBeNull();
    await getSummaryForDoctor(p.sessionId, p.doctorId);
    const logs = await db().select().from(schema.auditLog).where(eq(schema.auditLog.objectId, p.sessionId));
    expect(logs.some((l) => l.action === "summary.viewed" && l.actorId === p.doctorId)).toBe(true);
    expect(JSON.stringify(logs)).not.toMatch(/Kephalgie/);
  });

  it("nach Notfall-Abbruch gibt es keine Zusammenfassung", async () => {
    const p = await seedPatient();
    await handlePatientMessage(p.sessionId, p.patientId, "Kopfschmerzen");
    await handlePatientMessage(p.sessionId, p.patientId, "Ich habe Brustschmerzen und Atemnot");
    expect(await getSummaryForDoctor(p.sessionId, p.doctorId)).toBeNull();
    expect((await db().select().from(schema.summary).where(eq(schema.summary.sessionId, p.sessionId)))).toHaveLength(0);
  });

  it("Snapshot ist unveränderlich: zweiter Aufruf erzeugt neue Version, Arzt sieht die letzte", async () => {
    const p = await seedPatient();
    await finish(p);
    await submitSession(p.sessionId, p.patientId);
    await createSummarySnapshot(p.sessionId);
    const snaps = await db().select().from(schema.summary).where(eq(schema.summary.sessionId, p.sessionId));
    expect(snaps.map((s) => s.version).sort()).toEqual([1, 2]);
    expect(await getSummaryForDoctor(p.sessionId, p.doctorId)).not.toBeNull();
  });
});
