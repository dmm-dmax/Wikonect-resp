import config from "@config/deflect.json";
import { compilePattern, normalize } from "@/lib/text";

const patterns = config.patterns.flatMap(compilePattern);
export const DEFLECT_ANSWER = config.answer;

const isQuestion = (s: string) => patterns.some((re) => re.test(s.toLowerCase())) || patterns.some((re) => re.test(normalize(s)));

/**
 * Erkennt Fragen nach Diagnose, Ursache, Bewertung oder Handlung.
 * Liefert den Text ohne diese Sätze. Antwort ist fest (kein KI-Aufruf).
 */
export function splitDeflect(text: string): { deflected: boolean; remainder: string } {
  const parts = text.split(/(?<=[.!?\n])\s+/);
  const keep = parts.filter((p) => !isQuestion(p));
  return { deflected: keep.length !== parts.length, remainder: keep.join(" ").trim() };
}
