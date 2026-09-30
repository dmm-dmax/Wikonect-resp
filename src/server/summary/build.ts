import { checkClinicalTerm } from "../filter";
import { COMPLAINT_FIELD_IDS, GENERAL_FIELD_IDS, fieldLabel } from "../dialog/engine";

/**
 * Deterministische Zusammenfassung für den Arzt. Kein KI-Text, kein Freitext-Generator.
 * Jeder Eintrag trägt Originalaussage, Fachübersetzung und Quelle. Reine Funktion, testbar.
 */
export const SUMMARY_BUILDER_VERSION = "summary-deterministic@v1";

export type SourceRef = { kind: "DIALOG" } | { kind: "DOCUMENT"; documentId: string; filename: string; page?: number | null };

export type SummaryItem = {
  field: string;
  fieldLabel: string;
  patientQuote: string;
  clinicalTerm: string | null;
  /** true: Übersetzung wurde vom Filter blockiert (Fallback auf Patientenzitat). null ohne Block: keine Übersetzung geliefert */
  translationBlocked: boolean;
  source: SourceRef;
  promptVersion: string | null;
  model: string | null;
};

export type SummaryLab = {
  nameAsPrinted: string;
  canonicalName: string | null;
  value: string;
  unit: string | null;
  refRangeAsPrinted: string | null;
  line: string;
  source: SourceRef;
  assignedBy: "PATIENT" | "RULE" | null;
  mappingRuleId: string | null;
};

export type SummaryDoc = { id: string; filename: string; kind: "PDF" | "IMAGE"; mime: string; note: string | null; text: string | null; complaintId: string | null };

export type SummarySection = {
  id: string;
  kind: "complaint" | "general" | "unassigned";
  title: string;
  patientLabel: string | null;
  region: string | null;
  headline: string;
  items: SummaryItem[];
  labs: SummaryLab[];
  attachments: string[]; // Dokument-IDs
};

export type SummaryModel = {
  version: string;
  sessionId: string;
  pseudonym: string;
  appointmentAt: string;
  submittedAt: string;
  sections: SummarySection[];
  documents: SummaryDoc[];
  patientFreeText: string[];
};

export type RawEntry = { field: string; quote: string; term: string | null; blocked: boolean; source: "DIALOG" | "DOCUMENT"; sourceRef?: string | null; promptVersion: string | null; model: string | null };
export type RawComplaint = { id: string; region: string; position: number; labelPatient: string; labelClinical: string | null; entries: RawEntry[] };
export type RawLab = Omit<SummaryLab, "source"> & { documentId: string; page: number | null; complaintId: string | null };

const GENERAL_REGION = "anamnese_allgemein";
const order = (ids: string[]) => (f: string) => {
  const i = ids.indexOf(f);
  return i < 0 ? ids.length : i;
};
const complaintOrder = order(COMPLAINT_FIELD_IDS);
const generalOrder = order(GENERAL_FIELD_IDS);

/** Zweite Verteidigungslinie: Übersetzungen, die inzwischen gegen den Filter verstoßen, werden entfernt. */
function guard(e: RawEntry, docName: Map<string, string>): SummaryItem {
  let term = e.term;
  let blocked = e.blocked;
  if (term && checkClinicalTerm(term, e.field).length) {
    term = null;
    blocked = true;
  }
  return {
    field: e.field,
    fieldLabel: fieldLabel(e.field),
    patientQuote: e.quote,
    clinicalTerm: term,
    translationBlocked: blocked,
    source: e.source === "DOCUMENT" ? { kind: "DOCUMENT", documentId: e.sourceRef ?? "", filename: docName.get(e.sourceRef ?? "") ?? "Dokument" } : { kind: "DIALOG" },
    promptVersion: e.promptVersion,
    model: e.model,
  };
}

function headline(title: string, items: SummaryItem[]): string {
  const parts = items.filter((i) => i.clinicalTerm && !i.translationBlocked && i.clinicalTerm !== "keine Angabe").map((i) => `${i.fieldLabel.split(" /")[0]}: ${i.clinicalTerm}`);
  return [title, ...parts].join(" · ");
}

export function buildSummaryModel(input: {
  sessionId: string;
  pseudonym: string;
  appointmentAt: Date;
  submittedAt: Date;
  complaints: RawComplaint[];
  labs: RawLab[];
  documents: SummaryDoc[];
  patientFreeText: string[];
}): SummaryModel {
  const docName = new Map(input.documents.map((d) => [d.id, d.filename]));
  const labSource = (l: RawLab): SourceRef => ({ kind: "DOCUMENT", documentId: l.documentId, filename: docName.get(l.documentId) ?? "Dokument", page: l.page });
  const sections: SummarySection[] = [];

  const sorted = [...input.complaints].sort((a, b) => a.position - b.position);
  const toLab = (l: RawLab): SummaryLab => {
    const { documentId: _d, page: _p, complaintId: _c, ...rest } = l;
    void _d; void _p; void _c;
    return { ...rest, source: labSource(l) };
  };
  const attachmentsFor = (id: string) => input.documents.filter((d) => d.complaintId === id).map((d) => d.id);

  for (const c of sorted.filter((x) => x.region !== GENERAL_REGION)) {
    const items = c.entries.map((e) => guard(e, docName)).sort((a, b) => complaintOrder(a.field) - complaintOrder(b.field));
    const clinical = c.labelClinical && !checkClinicalTerm(c.labelClinical, "beschwerde").length ? c.labelClinical : null;
    sections.push({
      id: c.id, kind: "complaint", title: clinical ?? c.labelPatient, patientLabel: c.labelPatient, region: c.region,
      headline: headline(clinical ?? c.labelPatient, items),
      items, labs: input.labs.filter((l) => l.complaintId === c.id).map(toLab), attachments: attachmentsFor(c.id),
    });
  }
  const general = sorted.find((x) => x.region === GENERAL_REGION);
  if (general) {
    const items = general.entries.map((e) => guard(e, docName)).sort((a, b) => generalOrder(a.field) - generalOrder(b.field));
    sections.push({ id: general.id, kind: "general", title: "Allgemeine Anamnese", patientLabel: null, region: null, headline: headline("Allgemeine Anamnese", items), items, labs: [], attachments: [] });
  }
  const loose = input.labs.filter((l) => !l.complaintId);
  const looseDocs = input.documents.filter((d) => !d.complaintId).map((d) => d.id);
  if (loose.length || looseDocs.length) {
    sections.push({ id: "unassigned", kind: "unassigned", title: "Befunde ohne Zuordnung", patientLabel: null, region: null, headline: "Befunde ohne Zuordnung", items: [], labs: loose.map(toLab), attachments: looseDocs });
  }

  return {
    version: SUMMARY_BUILDER_VERSION,
    sessionId: input.sessionId,
    pseudonym: input.pseudonym,
    appointmentAt: input.appointmentAt.toISOString(),
    submittedAt: input.submittedAt.toISOString(),
    sections,
    documents: input.documents,
    patientFreeText: input.patientFreeText,
  };
}
