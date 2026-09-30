/** Normalisierung für Regelabgleich: klein, Umlaute → ae/oe/ue, ß → ss, Akzente entfernt, Leerraum vereinheitlicht. */
export function normalize(s: string): string {
  return translit(s.normalize("NFKC").toLowerCase())
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[​-‏⁠﻿]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function translit(s: string): string {
  return s.replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss");
}

/** Unicode-taugliche Wortgrenze (\b in JS kennt nur ASCII). */
const UB = "(?:(?<![\\p{L}\\p{N}_])(?=[\\p{L}\\p{N}_])|(?<=[\\p{L}\\p{N}_])(?![\\p{L}\\p{N}_]))";

export function compilePattern(src: string): RegExp[] {
  const a = src.replaceAll("\\b", UB);
  const t = translit(src).replaceAll("\\b", UB);
  const list = [new RegExp(a, "iu")];
  if (t !== a) list.push(new RegExp(t, "iu"));
  return list;
}
