import { and, asc, desc, eq } from "drizzle-orm";
import { db, schema } from "../db";
import { audit } from "../audit";
import { decryptField, encryptField } from "../crypto/field";
import { buildSummaryModel, SUMMARY_BUILDER_VERSION, type RawComplaint, type RawLab, type SummaryDoc, type SummaryModel } from "./build";

/** Erzeugt beim Absenden einen unveränderlichen Snapshot (Version n+1). */
export async function createSummarySnapshot(sessionId: string): Promise<SummaryModel> {
  const [row] = await db()
    .select({ s: schema.anamnesisSession, p: schema.patient })
    .from(schema.anamnesisSession)
    .innerJoin(schema.patient, eq(schema.patient.id, schema.anamnesisSession.patientId))
    .where(eq(schema.anamnesisSession.id, sessionId))
    .limit(1);
  if (!row) throw new Error("Sitzung nicht gefunden");
  const pid = row.p.practiceId;

  const comps = await db().select().from(schema.complaint).where(eq(schema.complaint.sessionId, sessionId));
  const complaints: RawComplaint[] = [];
  for (const c of comps) {
    const es = await db().select().from(schema.entry).where(eq(schema.entry.complaintId, c.id)).orderBy(asc(schema.entry.createdAt));
    complaints.push({
      id: c.id, region: c.region, position: c.position,
      labelPatient: decryptField(c.labelPatientEnc, pid, `complaint:${c.id}`),
      labelClinical: c.labelClinicalEnc ? decryptField(c.labelClinicalEnc, pid, `complaint-clin:${c.id}`) : null,
      entries: es.map((e) => ({
        field: e.field,
        quote: decryptField(e.patientQuoteEnc, pid, `entry:${e.id}`),
        term: e.clinicalTermEnc ? decryptField(e.clinicalTermEnc, pid, `term:${e.id}`) : null,
        blocked: e.translationBlocked, source: e.source, sourceRef: e.sourceRef, promptVersion: e.promptVersion, model: e.model,
      })),
    });
  }

  const docRows = await db().select().from(schema.document).where(eq(schema.document.sessionId, sessionId)).orderBy(asc(schema.document.createdAt));
  const documents: SummaryDoc[] = docRows.map((d) => ({
    id: d.id, kind: d.kind, mime: d.mime, note: d.extractionNote, complaintId: d.complaintId,
    filename: decryptField(d.filenameEnc, pid, `docname:${d.id}`),
    text: d.extractedTextEnc ? decryptField(d.extractedTextEnc, pid, `doctext:${d.id}`) : null,
  }));
  const labs: RawLab[] = [];
  for (const d of docRows) {
    const vs = await db().select().from(schema.labValue).where(eq(schema.labValue.documentId, d.id));
    for (const v of vs) {
      labs.push({
        documentId: d.id, page: v.page, complaintId: v.complaintId,
        nameAsPrinted: decryptField(v.nameAsPrintedEnc, pid, `lab-name:${v.id}`),
        canonicalName: v.canonicalName,
        value: decryptField(v.valueEnc, pid, `lab-value:${v.id}`),
        unit: v.unitEnc ? decryptField(v.unitEnc, pid, `lab-unit:${v.id}`) : null,
        refRangeAsPrinted: v.refRangeAsPrintedEnc ? decryptField(v.refRangeAsPrintedEnc, pid, `lab-ref:${v.id}`) : null,
        line: decryptField(v.lineEnc, pid, `lab-line:${v.id}`),
        assignedBy: (v.assignedBy as "PATIENT" | "RULE" | null) ?? null,
        mappingRuleId: v.mappingRuleId,
      });
    }
  }
  const msgs = await db().select().from(schema.message).where(and(eq(schema.message.sessionId, sessionId), eq(schema.message.role, "patient"))).orderBy(asc(schema.message.createdAt));

  const model = buildSummaryModel({
    sessionId, pseudonym: row.p.pseudonym, appointmentAt: row.s.appointmentAt, submittedAt: row.s.submittedAt ?? new Date(),
    complaints, labs, documents,
    patientFreeText: msgs.slice(0, 1).map((m) => decryptField(m.contentEnc, pid, `msg:${sessionId}`)), // Erstbeschreibung im Wortlaut
  });

  const existing = await db().select({ v: schema.summary.version }).from(schema.summary).where(eq(schema.summary.sessionId, sessionId));
  const version = existing.reduce((m, x) => Math.max(m, x.v), 0) + 1;
  await db().insert(schema.summary).values({
    sessionId, version, contentEnc: encryptField(JSON.stringify(model), pid, `summary:${sessionId}:${version}`),
    promptVersion: SUMMARY_BUILDER_VERSION, model: null,
  });
  await audit({ actorType: "system", action: "summary.created", objectType: "anamnesis_session", objectId: sessionId });
  return model;
}

/** Arztansicht. Nur eigene, abgesendete Sitzungen. */
export async function getSummaryForDoctor(sessionId: string, doctorId: string): Promise<SummaryModel | null> {
  const [row] = await db()
    .select({ s: schema.anamnesisSession, practiceId: schema.patient.practiceId })
    .from(schema.anamnesisSession)
    .innerJoin(schema.patient, eq(schema.patient.id, schema.anamnesisSession.patientId))
    .where(and(eq(schema.anamnesisSession.id, sessionId), eq(schema.anamnesisSession.doctorId, doctorId), eq(schema.anamnesisSession.status, "SUBMITTED")))
    .limit(1);
  if (!row) return null;
  const [snap] = await db().select().from(schema.summary).where(eq(schema.summary.sessionId, sessionId)).orderBy(desc(schema.summary.version)).limit(1);
  if (!snap) return null;
  await audit({ actorType: "doctor", actorId: doctorId, action: "summary.viewed", objectType: "anamnesis_session", objectId: sessionId });
  return JSON.parse(decryptField(snap.contentEnc, row.practiceId, `summary:${sessionId}:${snap.version}`)) as SummaryModel;
}
