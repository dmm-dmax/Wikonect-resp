import config from "@config/filter-patterns.json";
import { compilePattern } from "@/lib/text";

/**
 * Output-Filter: blockt Diagnose-, Ursachen-, Wahrscheinlichkeits-, Dringlichkeits-,
 * Empfehlungs- und Interpretationssprache in KI-Ausgaben.
 * Grenze: erkennt keine umschriebenen Bewertungen. Sicherheitsnetz, kein Nachweis.
 */
export type FilterHit = { category: string; pattern: string };

const categories = Object.entries(config.categories).map(([category, pats]) => ({
  category,
  rules: pats.map((p) => ({ src: p, res: compilePattern(p) })),
}));
const disease = config.diseaseTerms.patterns.map((p) => ({ src: p, res: compilePattern(p) }));

const clean = (s: string) => s.normalize("NFKC").replace(/[​-‏⁠﻿]/g, "").replace(/\s+/g, " ");

export function checkText(text: string): FilterHit[] {
  const t = clean(text);
  const hits: FilterHit[] = [];
  for (const c of categories) for (const r of c.rules) if (r.res.some((re) => re.test(t))) hits.push({ category: c.category, pattern: r.src });
  return hits;
}

/** Fachterm-Feld: zusätzlich Krankheitsnamen blocken (außer in erlaubten Feldern, z. B. Vorerkrankungen). */
export function checkClinicalTerm(text: string, field?: string): FilterHit[] {
  const hits = checkText(text);
  if (field && (config.diseaseTerms.allowedFields as string[]).includes(field)) return hits;
  const t = clean(text);
  for (const r of disease) if (r.res.some((re) => re.test(t))) hits.push({ category: "krankheitsname", pattern: r.src });
  return hits;
}

export const isClean = (hits: FilterHit[]) => hits.length === 0;
export const FILTER_VERSION = config.version;
