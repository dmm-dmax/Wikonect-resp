import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "../db";
import { audit } from "../audit";
import { decryptField, encryptField } from "../crypto/field";
import { hasRequiredConsents } from "../consent";
import { deleteSessionData } from "../retention";
import { detectEmergency, emergencyResponse, EMERGENCY_VERSION, type EmergencyResponse } from "../emergency";
import { checkClinicalTerm } from "../filter";
import { assertSafeAssistantText, extractComplaints, extractSlot, type ComplaintDraft, type Meta } from "../llm/tasks";
import { reassignLabs } from "../upload/service";
import { redactIdentifiers } from "./redact";
import { splitDeflect, DEFLECT_ANSWER } from "./deflect";
import {
  dialogStateSchema, initialState, isNoAnswer, isSkipAnswer, key, MAX_COMPLAINTS, nextStep, noneText, progress, questionText,
  type DialogState, type Step,
} from "./engine";

const MAX_INPUT = 2000;
const GENERAL_REGION = "anamnese_allgemein";

type Session = typeof schema.anamnesisSession.$inferSelect;

export type DialogView = {
  status: Session["status"];
  progress: number;
  messages: { role: "patient" | "assistant"; text: string }[];
  step: Step["kind"];
  review: { label: string; quotes: string[] }[];
  emergency?: EmergencyResponse;
};

export type TurnResult =
  | { kind: "ok" }
  | { kind: "deflected" }
  | { kind: "emergency"; response: EmergencyResponse }
  | { kind: "error"; error: string };

async function loadOwned(sessionId: string, patientId: string): Promise<{ s: Session; practiceId: string } | null> {
  const [row] = await db()
    .select({ s: schema.anamnesisSession, practiceId: schema.patient.practiceId })
    .from(schema.anamnesisSession)
    .innerJoin(schema.patient, eq(schema.patient.id, schema.anamnesisSession.patientId))
    .where(and(eq(schema.anamnesisSession.id, sessionId), eq(schema.anamnesisSession.patientId, patientId)))
    .limit(1);
  return row ?? null;
}

const stateOf = (s: Session): DialogState => {
  const p = dialogStateSchema.safeParse(s.dialogState);
  return p.success ? p.data : initialState();
};

async function saveState(id: string, st: DialogState) {
  await db().update(schema.anamnesisSession).set({ dialogState: st }).where(eq(schema.anamnesisSession.id, id));
}

async function addMessage(sessionId: string, practiceId: string, role: "patient" | "assistant", text: string, meta?: { promptVersion?: string; model?: string }) {
  await db().insert(schema.message).values({
    sessionId, role, contentEnc: encryptField(text, practiceId, `msg:${sessionId}`),
    promptVersion: meta?.promptVersion ?? null, model: meta?.model ?? null,
  });
}

async function complaintLabels(sessionId: string, practiceId: string) {
  const rows = await db().select().from(schema.complaint).where(eq(schema.complaint.sessionId, sessionId)).orderBy(asc(schema.complaint.position));
  return new Map(rows.map((c) => [c.id, { id: c.id, region: c.region, label: decryptField(c.labelPatientEnc, practiceId, `complaint:${c.id}`) }]));
}

/** Patientenbezeichnung in der Frage nur, wenn sie selbst keine Diagnose-/Bewertungssprache enthält. */
function safeLabel(label: string | undefined): string | undefined {
  if (!label) return undefined;
  return checkClinicalTerm(label, "beschwerde").length ? undefined : label;
}

async function currentQuestion(s: Session, practiceId: string): Promise<{ step: Step; text: string }> {
  const st = stateOf(s);
  const step = nextStep(st);
  const labels = step.kind === "field" && step.complaintId ? await complaintLabels(s.id, practiceId) : null;
  const label = step.kind === "field" && step.complaintId ? safeLabel(labels?.get(step.complaintId)?.label) : undefined;
  const base = questionText(step, undefined); // Vorlage ohne Patiententext prüfen
  assertSafeAssistantText(base);
  return { step, text: questionText(step, label) };
}

async function ensureStarted(s: Session, practiceId: string) {
  const [m] = await db().select({ id: schema.message.id }).from(schema.message).where(eq(schema.message.sessionId, s.id)).limit(1);
  if (!m && s.status === "OPEN") {
    const st = stateOf(s);
    await saveState(s.id, st);
    const { text } = await currentQuestion({ ...s, dialogState: st }, practiceId);
    await addMessage(s.id, practiceId, "assistant", text);
  }
}

export async function getDialogView(sessionId: string, patientId: string): Promise<DialogView | null> {
  const owned = await loadOwned(sessionId, patientId);
  if (!owned) return null;
  const { practiceId } = owned;
  if (owned.s.status === "OPEN") await ensureStarted(owned.s, practiceId);
  const [s] = await db().select().from(schema.anamnesisSession).where(eq(schema.anamnesisSession.id, sessionId));
  if (!s) return null;
  const st = stateOf(s);
  const msgs = await db().select().from(schema.message).where(eq(schema.message.sessionId, sessionId)).orderBy(asc(schema.message.createdAt));
  const view: DialogView = {
    status: s.status,
    progress: s.status === "SUBMITTED" ? 100 : progress(st),
    messages: msgs.map((m) => ({ role: m.role as "patient" | "assistant", text: decryptField(m.contentEnc, practiceId, `msg:${sessionId}`) })),
    step: nextStep(st).kind,
    review: [],
  };
  if (s.status === "ABORTED_EMERGENCY") view.emergency = emergencyResponse(st.abortKind ?? "emergency");
  if (nextStep(st).kind === "review" || s.status === "SUBMITTED") view.review = await patientReview(sessionId, practiceId);
  return view;
}

async function patientReview(sessionId: string, practiceId: string) {
  const comps = await db().select().from(schema.complaint).where(eq(schema.complaint.sessionId, sessionId)).orderBy(asc(schema.complaint.position));
  const out: { label: string; quotes: string[] }[] = [];
  for (const c of comps) {
    const es = await db().select().from(schema.entry).where(eq(schema.entry.complaintId, c.id));
    out.push({
      label: c.region === GENERAL_REGION ? "Allgemeine Angaben" : decryptField(c.labelPatientEnc, practiceId, `complaint:${c.id}`),
      quotes: es.map((e) => decryptField(e.patientQuoteEnc, practiceId, `entry:${e.id}`)),
    });
  }
  return out;
}

async function abortEmergency(s: Session, kind: "emergency" | "crisis", ruleId: string): Promise<TurnResult> {
  // Datenminimierung: Sitzungsinhalt wird verworfen, der Arzt sieht nur den Abbruchvermerk.
  await deleteSessionData(s.id, "emergency_abort");
  await db().update(schema.anamnesisSession).set({ status: "ABORTED_EMERGENCY", dialogState: { ...initialState(), phase: "aborted", abortKind: kind } }).where(eq(schema.anamnesisSession.id, s.id));
  await audit({ actorType: "system", action: `dialog.emergency_abort.${ruleId}.${EMERGENCY_VERSION}`, objectType: "anamnesis_session", objectId: s.id });
  return { kind: "emergency", response: emergencyResponse(kind) };
}

async function patientTexts(sessionId: string, practiceId: string): Promise<string[]> {
  const rows = await db().select().from(schema.message).where(and(eq(schema.message.sessionId, sessionId), eq(schema.message.role, "patient"))).orderBy(asc(schema.message.createdAt));
  return rows.map((m) => decryptField(m.contentEnc, practiceId, `msg:${sessionId}`));
}

async function saveEntry(practiceId: string, complaintId: string, field: string, quote: string, term: string | null, meta: Meta | null) {
  const id = crypto.randomUUID();
  await db().insert(schema.entry).values({
    id, complaintId, field,
    patientQuoteEnc: encryptField(quote, practiceId, `entry:${id}`),
    clinicalTermEnc: term ? encryptField(term, practiceId, `term:${id}`) : null,
    translationBlocked: meta?.blocked ?? false,
    source: "DIALOG",
    promptVersion: meta?.promptVersion ?? null,
    model: meta?.model ?? null,
  });
}

async function addComplaints(s: Session, practiceId: string, st: DialogState, drafts: ComplaintDraft[], meta: Meta) {
  for (const d of drafts) {
    if (st.complaintIds.length >= MAX_COMPLAINTS) break;
    const id = crypto.randomUUID();
    await db().insert(schema.complaint).values({
      id, sessionId: s.id, region: d.region, position: st.complaintIds.length,
      labelPatientEnc: encryptField(d.labelPatient, practiceId, `complaint:${id}`),
      labelClinicalEnc: d.labelClinical ? encryptField(d.labelClinical, practiceId, `complaint-clin:${id}`) : null,
    });
    st.complaintIds.push(id);
    for (const e of d.entries) {
      await saveEntry(practiceId, id, e.field, e.quote, e.term, meta);
      if (!st.filled.includes(key(id, e.field))) st.filled.push(key(id, e.field));
    }
  }
}

async function generalComplaintId(s: Session, practiceId: string): Promise<string> {
  const rows = await db().select().from(schema.complaint).where(eq(schema.complaint.sessionId, s.id));
  const g = rows.find((c) => c.region === GENERAL_REGION);
  if (g) return g.id;
  const id = crypto.randomUUID();
  await db().insert(schema.complaint).values({ id, sessionId: s.id, region: GENERAL_REGION, position: 999, labelPatientEnc: encryptField("Allgemeine Anamnese", practiceId, `complaint:${id}`) });
  return id;
}

export async function handlePatientMessage(sessionId: string, patientId: string, rawText: string): Promise<TurnResult> {
  const owned = await loadOwned(sessionId, patientId);
  if (!owned) return { kind: "error", error: "Sitzung nicht gefunden." };
  const { s, practiceId } = owned;
  if (s.status !== "OPEN") return { kind: "error", error: "Der Dialog ist beendet." };
  if (!(await hasRequiredConsents(patientId))) return { kind: "error", error: "Einwilligung fehlt." };
  const text = redactIdentifiers(rawText.trim().slice(0, MAX_INPUT));
  if (!text) return { kind: "error", error: "Bitte geben Sie etwas ein." };

  await ensureStarted(s, practiceId);

  // 1. Notfall-Erkennung: regelbasiert, vor jeder KI, auf dem Gesamttext der Sitzung. Text wird nicht gespeichert.
  const hit = detectEmergency([...(await patientTexts(sessionId, practiceId)), rawText]);
  if (hit) return abortEmergency(s, hit.kind, hit.ruleId);

  const st = stateOf(s);
  const step = nextStep(st);
  if (step.kind === "done" || step.kind === "review") return { kind: "error", error: "Bitte senden Sie Ihre Angaben ab oder prüfen Sie sie." };

  // 2. Fragen nach Diagnose/Ursache/Bewertung: feste Antwort, kein KI-Aufruf.
  const { deflected, remainder } = splitDeflect(text);
  const substantive = remainder.split(/\s+/).filter(Boolean).length >= 3 || isNoAnswer(remainder) || isSkipAnswer(remainder);
  if (deflected && !substantive) {
    await addMessage(sessionId, practiceId, "assistant", DEFLECT_ANSWER);
    await addMessage(sessionId, practiceId, "assistant", (await currentQuestion(s, practiceId)).text);
    await audit({ actorType: "patient", actorId: patientId, action: "dialog.deflected", objectType: "anamnesis_session", objectId: sessionId });
    return { kind: "deflected" };
  }
  const answer = deflected ? remainder : text;
  await addMessage(sessionId, practiceId, "patient", answer);

  // 3. Antwort verarbeiten
  if (step.kind === "intro") {
    const { complaints, meta } = await extractComplaints(answer);
    await addComplaints(s, practiceId, st, complaints, meta);
    st.phase = "complaints";
  } else if (step.kind === "more") {
    if (isNoAnswer(answer)) st.moreAsked = true;
    else {
      const { complaints, meta } = await extractComplaints(answer);
      await addComplaints(s, practiceId, st, complaints, meta);
      st.moreAsked = false;
    }
  } else {
    const scope = step.scope === "complaint" ? step.complaintId : await generalComplaintId(s, practiceId);
    const fillKey = key(step.scope === "complaint" ? step.complaintId : "general", step.field);
    if (isNoAnswer(answer) && noneText(step.field)) {
      await saveEntry(practiceId, scope, step.field, answer, noneText(step.field), null);
    } else if (isSkipAnswer(answer)) {
      await saveEntry(practiceId, scope, step.field, answer, "keine Angabe", null);
    } else {
      const label = step.scope === "complaint" ? (await complaintLabels(sessionId, practiceId)).get(step.complaintId)?.label ?? null : null;
      const { slot, meta } = await extractSlot(step.field, label, answer);
      await saveEntry(practiceId, scope, step.field, slot.quote, slot.term, meta);
    }
    st.filled.push(fillKey);
  }

  await saveState(sessionId, st);
  await reassignLabs(sessionId);
  if (deflected) await addMessage(sessionId, practiceId, "assistant", DEFLECT_ANSWER);
  const fresh = { ...s, dialogState: st } as Session;
  const q = await currentQuestion(fresh, practiceId);
  await addMessage(sessionId, practiceId, "assistant", q.text);
  await audit({ actorType: "patient", actorId: patientId, action: "dialog.turn", objectType: "anamnesis_session", objectId: sessionId });
  return { kind: "ok" };
}

export async function submitSession(sessionId: string, patientId: string): Promise<{ ok: boolean; error?: string }> {
  const owned = await loadOwned(sessionId, patientId);
  if (!owned) return { ok: false, error: "Sitzung nicht gefunden." };
  const { s } = owned;
  if (s.status !== "OPEN") return { ok: false, error: "Der Dialog ist beendet." };
  if (!(await hasRequiredConsents(patientId))) return { ok: false, error: "Einwilligung fehlt." };
  const st = stateOf(s);
  if (nextStep(st).kind !== "review") return { ok: false, error: "Der Dialog ist noch nicht abgeschlossen." };
  st.phase = "submitted";
  await db().update(schema.anamnesisSession).set({ status: "SUBMITTED", submittedAt: new Date(), dialogState: st }).where(eq(schema.anamnesisSession.id, sessionId));
  await audit({ actorType: "patient", actorId: patientId, action: "session.submitted", objectType: "anamnesis_session", objectId: sessionId });
  return { ok: true };
}
