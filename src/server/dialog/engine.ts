import q from "@config/questions.json";
import { z } from "zod";

/**
 * Zustandsautomat des Dialogs. Reiner Code, keine KI, keine Datenbank.
 * Er entscheidet, welche Frage als Nächstes kommt (nur aus dem Katalog).
 */
export const COMPLAINT_FIELD_IDS = q.complaintFields.map((f) => f.id);
export const GENERAL_FIELD_IDS = q.generalFields.map((f) => f.id);

export const dialogStateSchema = z.object({
  phase: z.enum(["intro", "complaints", "review", "submitted", "aborted"]),
  complaintIds: z.array(z.string()),
  filled: z.array(z.string()), // "<complaintId>:<field>" bzw. "general:<field>"
  moreAsked: z.boolean(),
  abortKind: z.enum(["emergency", "crisis"]).optional(),
});
export type DialogState = z.infer<typeof dialogStateSchema>;

export const initialState = (): DialogState => ({ phase: "intro", complaintIds: [], filled: [], moreAsked: false });

export const key = (scope: string, field: string) => `${scope}:${field}`;

export type Step =
  | { kind: "intro" }
  | { kind: "field"; scope: "complaint"; complaintId: string; field: string }
  | { kind: "more" }
  | { kind: "field"; scope: "general"; complaintId: null; field: string }
  | { kind: "review" }
  | { kind: "done" };

export function nextStep(s: DialogState): Step {
  if (s.phase === "submitted" || s.phase === "aborted") return { kind: "done" };
  if (s.phase === "intro") return { kind: "intro" };
  const filled = new Set(s.filled);
  for (const cid of s.complaintIds) {
    for (const f of COMPLAINT_FIELD_IDS) if (!filled.has(key(cid, f))) return { kind: "field", scope: "complaint", complaintId: cid, field: f };
  }
  if (!s.moreAsked && s.complaintIds.length < q.maxComplaints) return { kind: "more" };
  for (const f of GENERAL_FIELD_IDS) if (!filled.has(key("general", f))) return { kind: "field", scope: "general", complaintId: null, field: f };
  return { kind: "review" };
}

/** Fortschritt in Prozent. Vor der Erstbeschreibung wird mit einer Beschwerde geschätzt. */
export function progress(s: DialogState): number {
  if (s.phase === "submitted") return 100;
  const n = Math.max(1, s.complaintIds.length);
  const total = 1 + n * COMPLAINT_FIELD_IDS.length + 1 + GENERAL_FIELD_IDS.length;
  const done = (s.phase === "intro" ? 0 : 1) + s.filled.length + (s.moreAsked ? 1 : 0);
  return Math.min(100, Math.round((done / total) * 100));
}

const norm = (t: string) => t.toLowerCase().replace(/[.!?]+$/g, "").trim();
export const isNoAnswer = (t: string) => q.noAnswers.includes(norm(t));
export const isSkipAnswer = (t: string) => q.skipAnswers.includes(norm(t));

export function questionText(step: Step, label?: string): string {
  const c = label ?? "diese Beschwerde";
  switch (step.kind) {
    case "intro": return q.intro;
    case "more": return q.more;
    case "review": return "Das sind Ihre Angaben. Bitte prüfen Sie sie. Wenn alles stimmt, senden Sie sie an Ihre Praxis.";
    case "done": return "";
    case "field": {
      const f = [...q.complaintFields, ...q.generalFields].find((x) => x.id === step.field);
      return (f?.question ?? "").replaceAll("{c}", c);
    }
  }
}

export const fieldLabel = (id: string) => [...q.complaintFields, ...q.generalFields].find((f) => f.id === id)?.label ?? id;
export const noneText = (field: string) => (q.noneText as Record<string, string>)[field] ?? null;
export const MAX_COMPLAINTS = q.maxComplaints;
export const QUESTIONS_VERSION = q.version;
