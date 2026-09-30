import config from "@config/lab-mapping.json";
import { normalize } from "@/lib/text";

/**
 * Laborwert-Extraktion (regelbasiert, ohne KI) und Zuordnung nach Organsystem.
 * Übernommen werden Name, Wert, Einheit und der im Dokument gedruckte Referenzbereich.
 * Es gibt KEINE Bewertung: keine Flags, kein "erhöht/erniedrigt", kein Vergleich mit Referenzwerten.
 */
export type ParsedLab = {
  nameAsPrinted: string;
  value: string; // wie gedruckt, inkl. Komparator (<, >)
  unit: string | null;
  refRangeAsPrinted: string | null;
  line: string;
  page: number;
  canonicalName: string | null;
  region: string | null;
  ruleId: string | null;
};

const denied = new Set(config.deniedNames.map(normalize));
const analytes = config.analytes.map((a) => ({ ...a, names: new Set(a.names.map(normalize)) }));

const NUM = /^\d+(?:[.,]\d+)?$/;
const UNIT = /^(?:%|[a-zA-Zµμ][a-zA-Zµμ0-9^*.%]*(?:\/[a-zA-Zµμ0-9^*.%]+)?|\/[a-zA-Zµμ0-9^*.%]+)$/;
const FLAG = /^(?:[HLhl]|\*|↑|↓|\+|-)$/;
const DATE_LIKE = /\d{1,2}\.\d{1,2}\.(?:\d{2}|\d{4})?/;

export function matchAnalyte(name: string) {
  const n = normalize(name).replace(/\s*\([^)]*\)\s*$/, "").trim();
  const full = normalize(name);
  return analytes.find((a) => a.names.has(n) || a.names.has(full)) ?? null;
}

function looksLikeRef(s: string): boolean {
  const t = s.replace(/^\(|\)$/g, "").trim();
  return /^[<>≤≥]?\s*\d+(?:[.,]\d+)?\s*(?:(?:-|–|—|bis)\s*\d+(?:[.,]\d+)?)?(?:\s*[a-zA-Zµμ%/0-9^*.]+)?$/.test(t);
}

export function parseLabLine(rawLine: string, page: number): ParsedLab | null {
  const line = rawLine.normalize("NFKC").replace(/\s+/g, " ").trim();
  if (line.length < 4 || line.length > 160 || DATE_LIKE.test(line)) return null;
  const tokens = line.split(" ");
  // Wert suchen (optional mit Komparator davor)
  let vi = -1;
  for (let i = 1; i < tokens.length; i++) {
    const tok = tokens[i]!;
    if (NUM.test(tok) || /^[<>≤≥]\d+(?:[.,]\d+)?$/.test(tok)) { vi = i; break; }
    if (/^[<>≤≥]$/.test(tok) && NUM.test(tokens[i + 1] ?? "")) { vi = i; break; }
  }
  if (vi < 1 || vi > 5) return null;
  const nameTokens = tokens.slice(0, vi);
  const name = nameTokens.join(" ");
  if (!/^\p{L}/u.test(name) || !/\p{L}{1,}/u.test(name)) return null;
  if (nameTokens.some((t) => denied.has(normalize(t)))) return null;

  let i = vi;
  let value = tokens[i]!;
  if (/^[<>≤≥]$/.test(value)) { value += tokens[i + 1]!; i += 1; }
  i += 1;
  let unit: string | null = null;
  if (tokens[i] && UNIT.test(tokens[i]!) && !FLAG.test(tokens[i]!)) { unit = tokens[i]!; i += 1; }
  let rest = tokens.slice(i);
  if (rest.length && FLAG.test(rest[rest.length - 1]!)) rest = rest.slice(0, -1); // Flags der Labore werden bewusst nicht übernommen
  const refText = rest.join(" ").trim();
  const ref = refText && looksLikeRef(refText) ? refText : null;
  // Ohne Einheit und ohne Referenz ist die Zeile kein sicherer Laborwert
  if (!unit && !ref) return null;
  const a = matchAnalyte(name);
  // Unbekannte Parameter nur mit Einheit UND gedrucktem Referenzbereich (sonst Verwechslung mit Dosierungen, Adressen …)
  if (!a && !(unit && ref)) return null;
  return {
    nameAsPrinted: name, value, unit, refRangeAsPrinted: ref, line, page,
    canonicalName: a?.canonical ?? null, region: a?.region ?? null, ruleId: a ? `${config.version}:${a.id}` : null,
  };
}

const MAX_VALUES = 300;

export function parseLabs(pages: string[]): ParsedLab[] {
  const out: ParsedLab[] = [];
  pages.forEach((text, idx) => {
    for (const l of text.split(/\r?\n/)) {
      const p = parseLabLine(l, idx + 1);
      if (p && out.length < MAX_VALUES) out.push(p);
    }
  });
  return out;
}

/** Zuordnung zur ersten Beschwerde derselben Region. Sonst keine Zuordnung. */
export function assignRegion(region: string | null, complaints: { id: string; region: string }[]): string | null {
  if (!region) return null;
  return complaints.find((c) => c.region === region)?.id ?? null;
}

export const LAB_MAPPING_VERSION = config.version;
