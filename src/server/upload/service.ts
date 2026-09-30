import { createHash } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "../db";
import { audit } from "../audit";
import { decryptField, encryptField } from "../crypto/field";
import { activeConsents } from "../consent";
import { cleanFilename, MAX_FILES_PER_SESSION, validateFile } from "./validate";
import { extractPdfText } from "./pdf";
import { assignRegion, parseLabs } from "./labs";
import { getDecrypted, putEncrypted, removeStored } from "./storage";

export type UploadResult = { ok: true; documentId: string; labValues: number; note: string | null } | { ok: false; error: string };

export async function uploadDocument(input: {
  sessionId: string;
  patientId: string;
  filename: string;
  declaredMime: string;
  bytes: Buffer;
  complaintId?: string | null;
}): Promise<UploadResult> {
  const [row] = await db()
    .select({ s: schema.anamnesisSession, practiceId: schema.patient.practiceId })
    .from(schema.anamnesisSession)
    .innerJoin(schema.patient, eq(schema.patient.id, schema.anamnesisSession.patientId))
    .where(and(eq(schema.anamnesisSession.id, input.sessionId), eq(schema.anamnesisSession.patientId, input.patientId)))
    .limit(1);
  if (!row) return { ok: false, error: "Sitzung nicht gefunden." };
  const { s, practiceId } = row;
  if (s.status !== "OPEN") return { ok: false, error: "Der Dialog ist beendet." };
  const consents = await activeConsents(input.patientId);
  if (!consents.has("upload") || !consents.has("ai_processing") || !consents.has("dialog")) return { ok: false, error: "Für den Upload fehlt Ihre Einwilligung." };

  const existing = await db().select({ id: schema.document.id, sha: schema.document.sha256 }).from(schema.document).where(eq(schema.document.sessionId, s.id));
  if (existing.length >= MAX_FILES_PER_SESSION) return { ok: false, error: `Höchstens ${MAX_FILES_PER_SESSION} Dateien.` };

  const v = validateFile(input.bytes, input.declaredMime);
  if (!v.ok) return v;
  const sha256 = createHash("sha256").update(input.bytes).digest("hex");
  if (existing.some((e) => e.sha === sha256)) return { ok: false, error: "Diese Datei ist schon hochgeladen." };

  // Zuordnung durch den Patienten: nur zu eigenen Beschwerden dieser Sitzung
  const complaints = await db().select().from(schema.complaint).where(eq(schema.complaint.sessionId, s.id)).orderBy(asc(schema.complaint.position));
  let chosen: string | null = null;
  if (input.complaintId) {
    if (!complaints.some((c) => c.id === input.complaintId)) return { ok: false, error: "Ungültige Zuordnung." };
    chosen = input.complaintId;
  }

  const storageKey = await putEncrypted(input.bytes, practiceId);
  const docId = crypto.randomUUID();
  let status: "NONE" | "DONE" | "FAILED" = "NONE";
  let note: string | null = null;
  let textEnc: string | null = null;
  let labs: ReturnType<typeof parseLabs> = [];

  if (v.kind === "PDF") {
    try {
      const { pages, truncated } = await extractPdfText(input.bytes);
      const all = pages.join("\n").trim();
      if (all.length < 20) {
        status = "FAILED";
        note = "no_text_layer"; // Scan ohne Textlayer: nur Anhang (kein OCR im MVP)
      } else {
        status = "DONE";
        note = truncated ? "truncated" : null;
        textEnc = encryptField(all, practiceId, `doctext:${docId}`);
        labs = parseLabs(pages);
      }
    } catch {
      status = "FAILED";
      note = "extraction_failed";
    }
  }

  await db().transaction(async (tx) => {
    await tx.insert(schema.document).values({
      id: docId, sessionId: s.id, kind: v.kind, mime: v.mime,
      filenameEnc: encryptField(cleanFilename(input.filename), practiceId, `docname:${docId}`),
      size: input.bytes.length, sha256, storageKey,
      extractionStatus: status, extractionNote: note, extractedTextEnc: textEnc, complaintId: chosen,
    });
    for (const l of labs) {
      const id = crypto.randomUUID();
      const byRule = chosen ? null : assignRegion(l.region, complaints);
      await tx.insert(schema.labValue).values({
        id, documentId: docId,
        complaintId: chosen ?? byRule,
        assignedBy: chosen ? "PATIENT" : byRule ? "RULE" : null,
        nameAsPrintedEnc: encryptField(l.nameAsPrinted, practiceId, `lab-name:${id}`),
        valueEnc: encryptField(l.value, practiceId, `lab-value:${id}`),
        unitEnc: l.unit ? encryptField(l.unit, practiceId, `lab-unit:${id}`) : null,
        refRangeAsPrintedEnc: l.refRangeAsPrinted ? encryptField(l.refRangeAsPrinted, practiceId, `lab-ref:${id}`) : null,
        lineEnc: encryptField(l.line, practiceId, `lab-line:${id}`),
        page: l.page, canonicalName: l.canonicalName, mappingRegion: l.region, mappingRuleId: l.ruleId,
      });
    }
  });
  await audit({ actorType: "patient", actorId: input.patientId, action: "document.uploaded", objectType: "document", objectId: docId });
  return { ok: true, documentId: docId, labValues: labs.length, note };
}

export async function listPatientDocuments(sessionId: string, patientId: string) {
  const [row] = await db()
    .select({ practiceId: schema.patient.practiceId })
    .from(schema.anamnesisSession)
    .innerJoin(schema.patient, eq(schema.patient.id, schema.anamnesisSession.patientId))
    .where(and(eq(schema.anamnesisSession.id, sessionId), eq(schema.anamnesisSession.patientId, patientId)))
    .limit(1);
  if (!row) return [];
  const docs = await db().select().from(schema.document).where(eq(schema.document.sessionId, sessionId)).orderBy(asc(schema.document.createdAt));
  const out = [];
  for (const d of docs) {
    const values = await db().select({ id: schema.labValue.id }).from(schema.labValue).where(eq(schema.labValue.documentId, d.id));
    out.push({ id: d.id, filename: decryptField(d.filenameEnc, row.practiceId, `docname:${d.id}`), kind: d.kind, note: d.extractionNote, labValues: values.length });
  }
  return out;
}

export async function deleteDocument(documentId: string, patientId: string): Promise<boolean> {
  const [row] = await db()
    .select({ d: schema.document, status: schema.anamnesisSession.status })
    .from(schema.document)
    .innerJoin(schema.anamnesisSession, eq(schema.anamnesisSession.id, schema.document.sessionId))
    .where(and(eq(schema.document.id, documentId), eq(schema.anamnesisSession.patientId, patientId)))
    .limit(1);
  if (!row || row.status !== "OPEN") return false;
  await removeStored(row.d.storageKey);
  await db().delete(schema.document).where(eq(schema.document.id, documentId)); // lab_value via cascade
  await audit({ actorType: "patient", actorId: patientId, action: "document.deleted", objectType: "document", objectId: documentId });
  return true;
}

/** Für die Arztansicht: entschlüsselte Datei. Zugriff prüft der Aufrufer (Arzt der Sitzung). */
export async function readDocumentFile(documentId: string, doctorId: string) {
  const [row] = await db()
    .select({ d: schema.document, s: schema.anamnesisSession, practiceId: schema.patient.practiceId })
    .from(schema.document)
    .innerJoin(schema.anamnesisSession, eq(schema.anamnesisSession.id, schema.document.sessionId))
    .innerJoin(schema.patient, eq(schema.patient.id, schema.anamnesisSession.patientId))
    .where(and(eq(schema.document.id, documentId), eq(schema.anamnesisSession.doctorId, doctorId), eq(schema.anamnesisSession.status, "SUBMITTED")))
    .limit(1);
  if (!row) return null;
  const bytes = await getDecrypted(row.d.storageKey, row.practiceId);
  await audit({ actorType: "doctor", actorId: doctorId, action: "document.viewed", objectType: "document", objectId: documentId });
  return { bytes, mime: row.d.mime, filename: decryptField(row.d.filenameEnc, row.practiceId, `docname:${row.d.id}`) };
}

/** Nach neuen Beschwerden: Werte ohne Patientenzuordnung erneut per Organsystem-Regel zuordnen. */
export async function reassignLabs(sessionId: string): Promise<void> {
  const complaints = await db().select({ id: schema.complaint.id, region: schema.complaint.region }).from(schema.complaint).where(eq(schema.complaint.sessionId, sessionId));
  const docs = await db().select({ id: schema.document.id }).from(schema.document).where(eq(schema.document.sessionId, sessionId));
  for (const d of docs) {
    const vals = await db().select().from(schema.labValue).where(eq(schema.labValue.documentId, d.id));
    for (const v of vals) {
      if (v.assignedBy === "PATIENT") continue;
      const cid = assignRegion(v.mappingRegion, complaints);
      await db().update(schema.labValue).set({ complaintId: cid, assignedBy: cid ? "RULE" : null }).where(eq(schema.labValue.id, v.id));
    }
  }
}

export async function listComplaintOptions(sessionId: string, patientId: string): Promise<{ id: string; label: string }[]> {
  const [row] = await db()
    .select({ practiceId: schema.patient.practiceId })
    .from(schema.anamnesisSession)
    .innerJoin(schema.patient, eq(schema.patient.id, schema.anamnesisSession.patientId))
    .where(and(eq(schema.anamnesisSession.id, sessionId), eq(schema.anamnesisSession.patientId, patientId)))
    .limit(1);
  if (!row) return [];
  const rows = await db().select().from(schema.complaint).where(eq(schema.complaint.sessionId, sessionId)).orderBy(asc(schema.complaint.position));
  return rows.filter((c) => c.region !== "anamnese_allgemein").map((c) => ({ id: c.id, label: decryptField(c.labelPatientEnc, row.practiceId, `complaint:${c.id}`) }));
}
