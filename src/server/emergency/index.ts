import config from "@config/emergency.json";
import { normalize } from "@/lib/text";

/**
 * Regelbasierte Notfall-Erkennung. Bewusst KEINE KI:
 * deterministisch, testbar, auditierbar, unabhängig von Modell/Anbieter, keine Halluzination.
 * Listen sind ein ENTWURF und brauchen medizinische Freigabe (siehe docs/risiken.md).
 */
export type EmergencyKind = "emergency" | "crisis";
export type EmergencyHit = { ruleId: string; kind: EmergencyKind };
export type EmergencyResponse = { title: string; text: string; lines: string[] };

type Rule = { id: string; kind: EmergencyKind; negationAware: boolean; groups: string[][] };

const rules: Rule[] = (config.rules as Rule[]).map((r) => ({ ...r, groups: r.groups.map((g) => g.map(normalize)) }));
const negBefore = new Set(config.negationBefore.map(normalize));
const negAfter = new Set(config.negationAfter.map(normalize));
const BOUNDARY = /[.!?;,\n:]|\b(aber|sondern|jedoch|doch|und|dafuer|allerdings)\b/g;

const words = (s: string) => s.split(/\s+/).filter(Boolean);

function isNegated(text: string, start: number, end: number): boolean {
  const before = text.slice(0, start).split(BOUNDARY).pop() ?? "";
  const after = text.slice(end).split(BOUNDARY)[0] ?? "";
  const b = words(before).slice(-3);
  const a = words(after).slice(0, 3);
  return b.some((w) => negBefore.has(w)) || a.some((w) => negAfter.has(w));
}

function groupMatches(text: string, group: string[], negationAware: boolean): boolean {
  for (const term of group) {
    let from = 0;
    for (;;) {
      const i = text.indexOf(term, from);
      if (i < 0) break;
      if (!negationAware || !isNegated(text, i, i + term.length)) return true;
      from = i + term.length;
    }
  }
  return false;
}

/** `texts`: alle bisherigen Patiententexte der Sitzung. Es zählt der Gesamttext, damit verteilte Angaben erkannt werden. */
export function detectEmergency(texts: string[]): EmergencyHit | null {
  const text = normalize(texts.join("\n"));
  for (const r of rules) {
    if (r.groups.every((g) => groupMatches(text, g, r.negationAware))) return { ruleId: r.id, kind: r.kind };
  }
  return null;
}

export const emergencyResponse = (kind: EmergencyKind): EmergencyResponse => config.responses[kind];
export const EMERGENCY_VERSION = config.version;
