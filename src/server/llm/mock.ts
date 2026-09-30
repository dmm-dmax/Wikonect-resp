import lex from "@config/mock-lexicon.json";
import { normalize } from "@/lib/text";
import type { LlmProvider, LlmRequest, LlmResponse } from "./types";
import type { ComplaintField } from "./schemas";

/** Deterministischer Ersatz für Entwicklung und Tests. Regelbasiert, ohne Netzwerk. */
type Entry = { field: ComplaintField; quote: string; term: string | null };

const lc = (s: string) => s.toLowerCase();

/** Findet `needle` (normalisiert) im Originaltext und gibt den Originalausschnitt (ganzes Wort) zurück. */
function quoteWord(text: string, needle: string): string | null {
  return quoteSpan(text, needle)?.quote ?? null;
}

function quoteSpan(text: string, needle: string): { quote: string; start: number; end: number } | null {
  const re = new RegExp(`[\\p{L}\\p{N}-]*${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\p{L}\\p{N}-]*`, "iu");
  const nText = translitKeepLength(text);
  const m = re.exec(nText);
  return m ? { quote: text.slice(m.index, m.index + m[0].length), start: m.index, end: m.index + m[0].length } : null;
}

/** ä→a, ö→o, ü→u, ß→s (Länge bleibt gleich) für Positionsabgleich. Needles ohne Umlaute. */
function translitKeepLength(s: string): string {
  return lc(s).replace(/ä/g, "a").replace(/ö/g, "o").replace(/ü/g, "u").replace(/ß/g, "s");
}
const flat = (n: string) => n.replace(/ae/g, "a").replace(/oe/g, "o").replace(/ue/g, "u");

type Hit = { quote: string; term: string; start: number; end: number };

function findIn(text: string, map: Record<string, string>): Hit[] {
  const out: Hit[] = [];
  const seen = new Set<string>();
  for (const [k, term] of Object.entries(map)) {
    const q = quoteSpan(text, flat(normalize(k)));
    if (q && !seen.has(term)) {
      seen.add(term);
      out.push({ ...q, term });
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

/** Zitat = zusammenhängender Originalausschnitt von der ersten bis zur letzten Fundstelle. */
const span = (text: string, hits: Hit[]) => text.slice(Math.min(...hits.map((h) => h.start)), Math.max(...hits.map((h) => h.end)));

function extractEntries(text: string, only?: ComplaintField): Entry[] {
  const entries: Entry[] = [];
  const add = (field: ComplaintField, quote: string | undefined, term: string | null) => {
    if (quote && (!only || only === field)) entries.push({ field, quote, term });
  };
  const beginn = /\b(seit|vor)\s+[^.,;!?\n]{1,40}|\b(gestern|heute|letzte[rn]? woche)\b/iu.exec(text);
  add("beginn", beginn?.[0].trim(), beginn ? beginn[0].trim().replace(/^vor\b/i, "vor") : null);
  const dur = findIn(text, lex.duration);
  // "seit 3 Tagen" beschreibt den Beginn, nicht die Dauer einer Episode
  const durNum = /\b\d+\s*(minuten?|stunden?|tage?n?|wochen?|monate?n?)\b/iu.exec(beginn ? text.replace(beginn[0], " ") : text);
  if (durNum) add("dauer", durNum[0], `Dauer ${durNum[0]}`);
  else if (dur[0]) add("dauer", dur[0].quote, dur[0].term);
  const q = findIn(text, lex.quality);
  if (q[0]) add("qualitaet", span(text, q), q.map((x) => x.term).join(", "));
  const nrs = /\b(\d{1,2})\s*(?:\/|von)\s*10\b/u.exec(text);
  if (nrs) add("intensitaet", nrs[0], `NRS ${nrs[1]}/10`);
  const c = findIn(text, lex.course);
  if (c[0]) add("verlauf", c[0].quote, c[0].term);
  const t = findIn(text, lex.triggers);
  if (t[0]) add("ausloeser", span(text, t), t.map((x) => x.term).join(", "));
  const a = findIn(text, lex.anatomy);
  const s = findIn(text, lex.side);
  if (a[0] || s[0]) {
    const parts = [...a, ...s].sort((x, y) => x.start - y.start);
    add("lokalisation", span(text, parts), parts.map((x) => x.term).join(" "));
  }
  const acc = findIn(text, lex.accompanying);
  if (acc[0]) add("begleitsymptome", span(text, acc), acc.map((x) => x.term).join("; "));
  return entries;
}

export class MockProvider implements LlmProvider {
  readonly name = "mock";
  readonly model = "mock-regelbasiert-1";

  async complete(req: LlmRequest): Promise<LlmResponse> {
    const text = String(req.input.text ?? "");
    if (req.task === "extract_complaints") return { model: this.model, json: this.complaints(text) };
    return { model: this.model, json: this.slot(String(req.input.field), text) };
  }

  private complaints(text: string) {
    // Angaben nach "dazu/zusätzlich/…" gelten als Begleitsymptome der ersten Beschwerde, nicht als neue Beschwerde
    const head = text.split(/\b(?:dazu|zusätzlich|zusaetzlich|begleitet|außerdem|ausserdem)\b/iu)[0] ?? text;
    const n = flat(normalize(head.trim() ? head : text));
    const found = lex.complaints.filter((c) => c.match.some((m) => n.includes(flat(m))));
    // "schmerz" (Generalfall) nur, wenn nichts Spezifischeres gefunden wurde
    const specific = found.filter((c) => c.label !== "Schmerzen");
    const list = specific.length ? specific : found;
    const entries = extractEntries(text);
    return {
      complaints: list.slice(0, 5).map((c, i) => {
        const hit = c.match.map((m) => quoteWord(text, flat(m))).find(Boolean);
        return {
          labelPatient: hit ?? c.label,
          labelClinical: c.clinical,
          region: c.region,
          // Angaben nur der ersten Beschwerde zuordnen, wenn mehrere erkannt wurden (konservativ)
          entries: i === 0 && list.length === 1 ? entries : [],
        };
      }),
    };
  }

  private slot(field: string, text: string) {
    const trimmed = text.trim().slice(0, 400);
    const fields: Record<string, ComplaintField> = {
      lokalisation: "lokalisation", beginn: "beginn", dauer: "dauer", qualitaet: "qualitaet",
      intensitaet: "intensitaet", verlauf: "verlauf", ausloeser: "ausloeser", begleitsymptome: "begleitsymptome",
    };
    const f = fields[field];
    if (f) {
      const e = extractEntries(text, f)[0];
      if (e) return { quote: e.quote, term: e.term };
      return { quote: trimmed, term: null };
    }
    if (field === "vorerkrankungen") {
      const h = findIn(text, lex.history);
      return { quote: trimmed, term: h.length ? h.map((x) => x.term).join("; ") : null };
    }
    return { quote: trimmed, term: null };
  }
}
