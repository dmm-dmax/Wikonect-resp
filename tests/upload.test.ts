import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db, schema } from "@/server/db";
import { MAX_FILE_BYTES, cleanFilename, sniff, validateFile } from "@/server/upload/validate";
import { parseLabLine, parseLabs } from "@/server/upload/labs";
import { deleteDocument, listPatientDocuments, readDocumentFile, uploadDocument } from "@/server/upload/service";
import { revokeConsent } from "@/server/consent";
import { decryptField } from "@/server/crypto/field";
import { checkText } from "@/server/filter";
import { handlePatientMessage } from "@/server/dialog/service";
import { JPG_MIN, PNG_1X1, blankPdf, labPdf, textPdf } from "./pdf-fixtures";
import { seedPatient } from "./helpers";

const LAB_ROWS = [
  ["Parameter", "Wert", "Einheit", "Referenz"],
  ["Kreatinin", "0,9", "mg/dl", "0,7 - 1,2"],
  ["CRP", "12,4", "mg/l", "< 5,0"],
  ["Leukozyten", "7,2", "/nl", "4,0 - 10,0"],
  ["Troponin T", "8", "ng/l", "< 14"],
  ["TSH", "2,1", "mU/l", "0,4 - 4,0"],
];

describe("Upload-Validierung", () => {
  it("erkennt Typen an Magic Bytes", () => {
    expect(sniff(Buffer.from("%PDF-1.7\n"))).toBe("application/pdf");
    expect(sniff(PNG_1X1)).toBe("image/png");
    expect(sniff(JPG_MIN)).toBe("image/jpeg");
    expect(sniff(Buffer.from("MZ\x90\x00"))).toBeNull();
  });
  it("lehnt falschen Typ, Umbenennung und Größe ab", () => {
    expect(validateFile(Buffer.from("MZ\x90\x00exe"), "application/pdf").ok).toBe(false);
    expect(validateFile(PNG_1X1, "application/pdf").ok).toBe(false);
    expect(validateFile(PNG_1X1, "text/html").ok).toBe(false);
    expect(validateFile(Buffer.alloc(0), "application/pdf").ok).toBe(false);
    expect(validateFile(Buffer.from("%PDF-1.4"), "application/pdf", MAX_FILE_BYTES + 1).ok).toBe(false);
  });
  it("akzeptiert PDF, PNG, JPG", () => {
    expect(validateFile(Buffer.from("%PDF-1.4\n%%EOF"), "application/pdf")).toMatchObject({ ok: true, kind: "PDF" });
    expect(validateFile(PNG_1X1, "image/png")).toMatchObject({ ok: true, kind: "IMAGE" });
    expect(validateFile(JPG_MIN, "image/jpg")).toMatchObject({ ok: true, kind: "IMAGE", mime: "image/jpeg" });
  });
  it("lehnt PDFs mit aktiven Inhalten oder Verschlüsselung ab", () => {
    expect(validateFile(Buffer.from("%PDF-1.4\n1 0 obj<</S/JavaScript/JS(app.alert(1))>>endobj"), "application/pdf").ok).toBe(false);
    expect(validateFile(Buffer.from("%PDF-1.4\n<</OpenAction 1 0 R>>"), "application/pdf").ok).toBe(false);
    expect(validateFile(Buffer.from("%PDF-1.4\n<</Encrypt 5 0 R>>"), "application/pdf").ok).toBe(false);
    expect(validateFile(Buffer.from("%PDF-1.4\n<</Type/JSONish>>"), "application/pdf").ok).toBe(true);
  });
  it("bereinigt Dateinamen", () => {
    expect(cleanFilename("../../etc/passwd")).not.toContain("/");
    expect(cleanFilename("<script>.pdf")).toBe("script.pdf");
    expect(cleanFilename("")).toBe("befund");
  });
});

describe("Laborwert-Parser (ohne Bewertung)", () => {
  it("übernimmt Name, Wert, Einheit, gedruckten Referenzbereich", () => {
    expect(parseLabLine("Kreatinin 0,9 mg/dl 0,7 - 1,2", 1)).toMatchObject({ nameAsPrinted: "Kreatinin", value: "0,9", unit: "mg/dl", refRangeAsPrinted: "0,7 - 1,2", canonicalName: "Kreatinin", region: "abdomen" });
    expect(parseLabLine("CRP 12,4 mg/l < 5,0", 1)).toMatchObject({ value: "12,4", unit: "mg/l", refRangeAsPrinted: "< 5,0", region: null });
    expect(parseLabLine("Leukozyten 7,2 /nl 4,0 - 10,0", 1)).toMatchObject({ unit: "/nl" });
    expect(parseLabLine("Troponin T < 3 ng/l", 1)?.value).toBe("<3");
  });
  it("verwirft Flags der Labore (keine Übernahme von Wertungen)", () => {
    const p = parseLabLine("CRP 12,4 mg/l < 5,0 H", 1)!;
    expect(JSON.stringify(p)).not.toMatch(/"H"| H$/);
    expect(p.refRangeAsPrinted).toBe("< 5,0");
  });
  it("erzeugt keine Wertungsfelder", () => {
    const p = parseLabLine("CRP 12,4 mg/l < 5,0", 1)!;
    expect(Object.keys(p).sort()).toEqual(["canonicalName", "line", "nameAsPrinted", "page", "refRangeAsPrinted", "region", "ruleId", "unit", "value"]);
  });
  it("ignoriert Kopfzeilen, Datum, Seitenzahl, Adressen", () => {
    for (const l of ["Parameter Wert Einheit Referenz", "Seite 1 von 2", "Datum: 12.03.2025", "Tel 0611 123456", "Patient geboren 01.01.1970", "Befundbericht Labor Musterstadt", "Musterstraße 12 a", "Medikation: Ibuprofen 400 mg"]) {
      expect(parseLabLine(l, 1), l).toBeNull();
    }
  });
  it("unbekannter Parameter wird mit Einheit und gedrucktem Referenzbereich übernommen, ohne Zuordnung", () => {
    expect(parseLabLine("Procalcitonin 0,05 ng/ml < 0,5", 1)).toMatchObject({ canonicalName: null, region: null, unit: "ng/ml", refRangeAsPrinted: "< 0,5" });
  });
  it("Parametername und Regel stammen aus der Konfiguration, frei von Wertungssprache", () => {
    const all = parseLabs([LAB_ROWS.map((r) => r.join(" ")).join("\n")]);
    expect(all).toHaveLength(5);
    for (const l of all) expect(checkText(l.canonicalName ?? "")).toEqual([]);
  });
});

describe("Upload-Service", () => {
  it("PDF: Text und Laborwerte werden übernommen, verschlüsselt gespeichert, per Organsystem zugeordnet", async () => {
    const p = await seedPatient();
    await handlePatientMessage(p.sessionId, p.patientId, "Seit 3 Tagen Bauchschmerzen links");
    const comps = await db().select().from(schema.complaint).where(eq(schema.complaint.sessionId, p.sessionId));
    expect(comps[0]!.region).toBe("abdomen");
    const r = await uploadDocument({ sessionId: p.sessionId, patientId: p.patientId, filename: "labor.pdf", declaredMime: "application/pdf", bytes: await labPdf(LAB_ROWS) });
    expect(r).toMatchObject({ ok: true, labValues: 5 });
    if (!r.ok) return;
    const [doc] = await db().select().from(schema.document).where(eq(schema.document.id, r.documentId));
    expect(doc!.extractionStatus).toBe("DONE");
    expect(JSON.stringify(doc)).not.toMatch(/Kreatinin|Laborbefund/);
    const vals = await db().select().from(schema.labValue).where(eq(schema.labValue.documentId, r.documentId));
    const byName = Object.fromEntries(vals.map((v) => [v.canonicalName, v]));
    expect(byName["Kreatinin"]!.complaintId).toBe(comps[0]!.id); // abdomen ↔ Bauchschmerzen
    expect(byName["Kreatinin"]!.assignedBy).toBe("RULE");
    expect(byName["Troponin"]!.complaintId).toBeNull(); // thorax: keine Beschwerde im Bereich
    expect(byName["Troponin"]!.assignedBy).toBeNull();
    expect(byName["CRP"]!.complaintId).toBeNull(); // allgemeiner Parameter
    expect(decryptField(byName["Kreatinin"]!.valueEnc, p.practice.id, `lab-value:${byName["Kreatinin"]!.id}`)).toBe("0,9");
    expect(JSON.stringify(vals)).not.toMatch(/0,9|mg\/dl/);
    // Keine Bewertungsspalten im Schema
    expect(Object.keys(vals[0]!)).not.toEqual(expect.arrayContaining(["flag", "abnormal", "interpretation"]));
  });

  it("Zuordnung durch den Patienten hat Vorrang und gilt für alle Werte des Dokuments", async () => {
    const p = await seedPatient();
    await handlePatientMessage(p.sessionId, p.patientId, "Kopfschmerzen seit gestern");
    const [c] = await db().select().from(schema.complaint).where(eq(schema.complaint.sessionId, p.sessionId));
    const r = await uploadDocument({ sessionId: p.sessionId, patientId: p.patientId, filename: "l.pdf", declaredMime: "application/pdf", bytes: await labPdf(LAB_ROWS), complaintId: c!.id });
    if (!r.ok) throw new Error(r.error);
    const vals = await db().select().from(schema.labValue).where(eq(schema.labValue.documentId, r.documentId));
    expect(vals.every((v) => v.complaintId === c!.id && v.assignedBy === "PATIENT")).toBe(true);
  });

  it("neue Beschwerde nach dem Upload → Regelzuordnung wird nachgezogen", async () => {
    const p = await seedPatient();
    const r = await uploadDocument({ sessionId: p.sessionId, patientId: p.patientId, filename: "l.pdf", declaredMime: "application/pdf", bytes: await labPdf(LAB_ROWS) });
    if (!r.ok) throw new Error(r.error);
    expect((await db().select().from(schema.labValue).where(eq(schema.labValue.documentId, r.documentId))).every((v) => v.complaintId === null)).toBe(true);
    await handlePatientMessage(p.sessionId, p.patientId, "Bauchschmerzen seit gestern");
    const vals = await db().select().from(schema.labValue).where(eq(schema.labValue.documentId, r.documentId));
    expect(vals.filter((v) => v.assignedBy === "RULE").map((v) => v.canonicalName)).toEqual(["Kreatinin"]);
  });

  it("Arztbrief-PDF ohne Laborwerte: Originaltext wird übernommen", async () => {
    const p = await seedPatient();
    const r = await uploadDocument({ sessionId: p.sessionId, patientId: p.patientId, filename: "brief.pdf", declaredMime: "application/pdf", bytes: await textPdf("Arztbrief (synthetisch)\nDer Patient stellte sich vor wegen Rueckenschmerzen.\nMedikation: Ibuprofen 400 mg") });
    expect(r).toMatchObject({ ok: true, labValues: 0 });
    if (!r.ok) return;
    const [d] = await db().select().from(schema.document).where(eq(schema.document.id, r.documentId));
    expect(decryptField(d!.extractedTextEnc!, p.practice.id, `doctext:${d!.id}`)).toContain("Rueckenschmerzen");
  });

  it("Scan ohne Textlayer und Bilder: nur Anhang, keine Auswertung", async () => {
    const p = await seedPatient();
    const a = await uploadDocument({ sessionId: p.sessionId, patientId: p.patientId, filename: "scan.pdf", declaredMime: "application/pdf", bytes: await blankPdf() });
    expect(a).toMatchObject({ ok: true, labValues: 0, note: "no_text_layer" });
    const b = await uploadDocument({ sessionId: p.sessionId, patientId: p.patientId, filename: "roentgen.png", declaredMime: "image/png", bytes: PNG_1X1 });
    expect(b).toMatchObject({ ok: true, labValues: 0 });
    if (!b.ok) return;
    const [d] = await db().select().from(schema.document).where(eq(schema.document.id, b.documentId));
    expect(d).toMatchObject({ kind: "IMAGE", extractionStatus: "NONE", extractedTextEnc: null });
    expect(await db().select().from(schema.labValue).where(eq(schema.labValue.documentId, b.documentId))).toHaveLength(0);
  });

  it("lehnt Duplikate, Fremdzuordnung und fehlende Einwilligung ab", async () => {
    const p = await seedPatient();
    const other = await seedPatient();
    const [oc] = [await (async () => {
      await handlePatientMessage(other.sessionId, other.patientId, "Kopfschmerzen");
      return (await db().select().from(schema.complaint).where(eq(schema.complaint.sessionId, other.sessionId)))[0]!;
    })()];
    const args = { sessionId: p.sessionId, patientId: p.patientId, filename: "a.png", declaredMime: "image/png", bytes: PNG_1X1 };
    expect((await uploadDocument(args)).ok).toBe(true);
    expect((await uploadDocument(args)).ok).toBe(false);
    expect((await uploadDocument({ ...args, bytes: Buffer.concat([PNG_1X1, Buffer.from([0])]), complaintId: oc.id })).ok).toBe(false);
    expect((await uploadDocument({ ...args, patientId: other.patientId })).ok).toBe(false);
    const q = await seedPatient({ consents: ["dialog", "ai_processing"] });
    expect((await uploadDocument({ ...args, sessionId: q.sessionId, patientId: q.patientId })).ok).toBe(false);
  });

  it("Dateianzahl ist begrenzt", async () => {
    const p = await seedPatient();
    for (let i = 0; i < 10; i++) {
      const r = await uploadDocument({ sessionId: p.sessionId, patientId: p.patientId, filename: `b${i}.png`, declaredMime: "image/png", bytes: Buffer.concat([PNG_1X1, Buffer.from([i])]) });
      expect(r.ok, String(i)).toBe(true);
    }
    const r = await uploadDocument({ sessionId: p.sessionId, patientId: p.patientId, filename: "x.png", declaredMime: "image/png", bytes: Buffer.concat([PNG_1X1, Buffer.from([99])]) });
    expect(r.ok).toBe(false);
  });

  it("Datei liegt nur verschlüsselt auf der Platte; Arzt liest erst nach Abgabe", async () => {
    const p = await seedPatient();
    const r = await uploadDocument({ sessionId: p.sessionId, patientId: p.patientId, filename: "x.png", declaredMime: "image/png", bytes: PNG_1X1 });
    if (!r.ok) throw new Error(r.error);
    const [d] = await db().select().from(schema.document).where(eq(schema.document.id, r.documentId));
    const { readFile } = await import("node:fs/promises");
    const onDisk = await readFile(path.resolve(process.env.STORAGE_DIR ?? "./storage", d!.storageKey));
    expect(onDisk.includes(PNG_1X1.subarray(0, 8))).toBe(false);
    expect(await readDocumentFile(r.documentId, p.doctorId)).toBeNull(); // Sitzung noch OPEN
    await db().update(schema.anamnesisSession).set({ status: "SUBMITTED" }).where(eq(schema.anamnesisSession.id, p.sessionId));
    const f = await readDocumentFile(r.documentId, p.doctorId);
    expect(f!.bytes.equals(PNG_1X1)).toBe(true);
    const other = await seedPatient();
    expect(await readDocumentFile(r.documentId, other.doctorId)).toBeNull(); // fremder Arzt
  });

  it("Patient kann löschen; Widerruf der Upload-Einwilligung entfernt Dateien und Werte", async () => {
    const p = await seedPatient();
    const a = await uploadDocument({ sessionId: p.sessionId, patientId: p.patientId, filename: "a.pdf", declaredMime: "application/pdf", bytes: await labPdf(LAB_ROWS) });
    const b = await uploadDocument({ sessionId: p.sessionId, patientId: p.patientId, filename: "b.png", declaredMime: "image/png", bytes: PNG_1X1 });
    if (!a.ok || !b.ok) throw new Error("upload");
    expect(await listPatientDocuments(p.sessionId, p.patientId)).toHaveLength(2);
    expect(await deleteDocument(b.documentId, p.patientId)).toBe(true);
    const [da] = await db().select().from(schema.document).where(eq(schema.document.id, a.documentId));
    const file = path.resolve(process.env.STORAGE_DIR ?? "./storage", da!.storageKey);
    expect(existsSync(file)).toBe(true);
    await revokeConsent(p.patientId, "upload");
    expect(existsSync(file)).toBe(false);
    expect(await db().select().from(schema.document).where(eq(schema.document.sessionId, p.sessionId))).toHaveLength(0);
    expect(await db().select().from(schema.labValue).where(eq(schema.labValue.documentId, a.documentId))).toHaveLength(0);
    // Dialogdaten bleiben bei Widerruf nur des Uploads erhalten
    const [s] = await db().select().from(schema.anamnesisSession).where(eq(schema.anamnesisSession.id, p.sessionId));
    expect(s!.status).toBe("OPEN");
  });
});
