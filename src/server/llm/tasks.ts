import { normalize } from "@/lib/text";
import { checkClinicalTerm, checkText, type FilterHit } from "../filter";
import { getProvider } from ".";
import { loadPrompt } from "./prompts";
import {
  complaintsSchema, slotSchema,
  type ComplaintField, type ComplaintsResult, type Slot,
} from "./schemas";

/**
 * Jede KI-Ausgabe durchläuft: Schema (Zod) → Zitat-Prüfung (muss im Patiententext stehen) → Output-Filter.
 * Bei Verstoß: ein Retry mit strict=true, dann Fallback (Patiententext ohne Übersetzung).
 */
export type Meta = {
  promptVersion: string;
  model: string;
  /** true: Übersetzung wurde blockiert, Fallback aktiv */
  blocked: boolean;
  /** Filterkategorien des letzten Verstoßes (keine Inhalte) */
  blockedCategories: string[];
};

const MAX_ATTEMPTS = 2;
const squash = (s: string) => normalize(s).replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const inText = (haystack: string, needle: string) => squash(haystack).includes(squash(needle));

type Attempt<T> = { ok: true; value: T } | { ok: false; categories: string[] };

async function run<T>(
  task: "extract_complaints" | "extract_slot",
  promptId: string,
  input: Record<string, unknown>,
  validate: (json: unknown) => Attempt<T>,
): Promise<{ result: T | null; meta: Meta }> {
  const prompt = loadPrompt(promptId);
  const provider = getProvider();
  let categories: string[] = [];
  let model = provider.model;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      const res = await provider.complete({
        task, promptId, promptVersion: prompt.label, system: prompt.text,
        input: { ...input, strict: attempt > 0 },
      });
      model = res.model;
      const v = validate(res.json);
      if (v.ok) return { result: v.value, meta: { promptVersion: prompt.label, model, blocked: false, blockedCategories: [] } };
      categories = v.categories;
    } catch {
      categories = ["provider_fehler"];
    }
  }
  return { result: null, meta: { promptVersion: prompt.label, model, blocked: true, blockedCategories: categories } };
}

const cats = (hits: FilterHit[]) => [...new Set(hits.map((h) => h.category))];

export async function extractSlot(field: string, complaintLabel: string | null, text: string) {
  const { result, meta } = await run<Slot>("extract_slot", "extract-slot", { field, complaint: complaintLabel, text }, (json) => {
    const p = slotSchema.safeParse(json);
    if (!p.success) return { ok: false, categories: ["schema"] };
    if (!inText(text, p.data.quote)) return { ok: false, categories: ["zitat_nicht_im_text"] };
    if (p.data.term) {
      const hits = checkClinicalTerm(p.data.term, field);
      if (hits.length) return { ok: false, categories: cats(hits) };
    }
    return { ok: true, value: p.data };
  });
  // Fallback: Patientenantwort unverändert, keine Übersetzung
  return { slot: result ?? { quote: text.trim().slice(0, 400), term: null }, meta };
}

export type ComplaintDraft = ComplaintsResult["complaints"][number];

export async function extractComplaints(text: string) {
  const { result, meta } = await run<ComplaintsResult>("extract_complaints", "extract-complaints", { text }, (json) => {
    const p = complaintsSchema.safeParse(json);
    if (!p.success) return { ok: false, categories: ["schema"] };
    const all: FilterHit[] = [];
    for (const c of p.data.complaints) {
      if (!inText(text, c.labelPatient)) return { ok: false, categories: ["zitat_nicht_im_text"] };
      if (c.labelClinical) all.push(...checkClinicalTerm(c.labelClinical, "beschwerde"));
      for (const e of c.entries) {
        if (!inText(text, e.quote)) return { ok: false, categories: ["zitat_nicht_im_text"] };
        if (e.term) all.push(...checkClinicalTerm(e.term, e.field as ComplaintField));
      }
    }
    return all.length ? { ok: false, categories: cats(all) } : { ok: true, value: p.data };
  });
  const fallback: ComplaintDraft[] = [
    { labelPatient: text.trim().slice(0, 80), labelClinical: null, region: "sonstige", entries: [] },
  ];
  return { complaints: result?.complaints ?? fallback, meta };
}

/** Sicherheitsnetz für jeden Text, der dem Patienten oder dem Arzt angezeigt wird und von der App erzeugt wurde. */
export function assertSafeAssistantText(text: string): void {
  const hits = checkText(text);
  if (hits.length) throw new Error(`Assistententext verletzt Leitplanke: ${cats(hits).join(",")}`);
}
