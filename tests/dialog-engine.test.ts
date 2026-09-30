import { describe, expect, it } from "vitest";
import q from "@config/questions.json";
import { checkText } from "@/server/filter";
import { DEFLECT_ANSWER, splitDeflect } from "@/server/dialog/deflect";
import { redactIdentifiers } from "@/server/dialog/redact";
import { initialState, isNoAnswer, isSkipAnswer, key, nextStep, progress, questionText, COMPLAINT_FIELD_IDS, GENERAL_FIELD_IDS } from "@/server/dialog/engine";

describe("Dialogfluss (Zustandsautomat)", () => {
  it("beginnt mit der Erstbeschreibung", () => {
    expect(nextStep(initialState()).kind).toBe("intro");
  });

  it("fragt alle Schemafelder je Beschwerde, dann 'weitere', dann allgemeine Felder, dann Prüfung", () => {
    const s = { ...initialState(), phase: "complaints" as const, complaintIds: ["c1"] };
    const seen: string[] = [];
    for (let i = 0; i < 40; i++) {
      const step = nextStep(s);
      if (step.kind === "review") break;
      if (step.kind === "more") { s.moreAsked = true; seen.push("more"); continue; }
      if (step.kind !== "field") throw new Error("unerwartet");
      seen.push(`${step.scope}:${step.field}`);
      s.filled.push(key(step.scope === "complaint" ? step.complaintId : "general", step.field));
    }
    expect(seen).toEqual([...COMPLAINT_FIELD_IDS.map((f) => `complaint:${f}`), "more", ...GENERAL_FIELD_IDS.map((f) => `general:${f}`)]);
    expect(nextStep(s).kind).toBe("review");
  });

  it("überspringt bereits aus der Erstbeschreibung gefüllte Felder", () => {
    const s = { ...initialState(), phase: "complaints" as const, complaintIds: ["c1"], filled: [key("c1", "lokalisation"), key("c1", "beginn")] };
    const step = nextStep(s);
    expect(step.kind === "field" && step.field).toBe("dauer");
  });

  it("jede Beschwerde bekommt alle Fragen", () => {
    const s = { ...initialState(), phase: "complaints" as const, complaintIds: ["c1", "c2"], filled: COMPLAINT_FIELD_IDS.map((f) => key("c1", f)) };
    const step = nextStep(s);
    expect(step.kind === "field" && step.scope === "complaint" && step.complaintId).toBe("c2");
  });

  it("Fortschritt steigt monoton und endet bei 100 nach Abschluss", () => {
    const s = { ...initialState(), phase: "complaints" as const, complaintIds: ["c1"] };
    let last = progress(s);
    for (let i = 0; i < 40; i++) {
      const step = nextStep(s);
      if (step.kind === "review") break;
      if (step.kind === "more") s.moreAsked = true;
      else if (step.kind === "field") s.filled.push(key(step.scope === "complaint" ? step.complaintId : "general", step.field));
      const p = progress(s);
      expect(p).toBeGreaterThanOrEqual(last);
      last = p;
    }
    expect(last).toBe(100);
    expect(progress({ ...s, phase: "submitted" })).toBe(100);
  });

  it("nach Abbruch und Abschluss gibt es keine weitere Frage", () => {
    expect(nextStep({ ...initialState(), phase: "aborted" }).kind).toBe("done");
    expect(nextStep({ ...initialState(), phase: "submitted" }).kind).toBe("done");
  });

  it("erkennt Verneinung und 'weiß nicht'", () => {
    expect(isNoAnswer("Nein.")).toBe(true);
    expect(isNoAnswer("nein, nichts weiter")).toBe(false);
    expect(isSkipAnswer("Weiß nicht")).toBe(true);
  });
});

describe("Fragenkatalog ist frei von Bewertungssprache", () => {
  const all = [q.intro, q.more, ...q.complaintFields.map((f) => f.question), ...q.generalFields.map((f) => f.question), DEFLECT_ANSWER];
  it.each(all)("%s", (text) => {
    expect(checkText(text.replaceAll("{c}", "diese Beschwerde"))).toEqual([]);
  });
  it("Review-Text und Platzhalter", () => {
    expect(questionText({ kind: "review" })).toContain("prüfen");
    expect(checkText(questionText({ kind: "review" }))).toEqual([]);
  });
});

describe("'Was habe ich?' wird mit fester Antwort abgewiesen", () => {
  it.each(["Was habe ich?", "Woran liegt das?", "Ist das schlimm?", "Was soll ich jetzt tun?", "Bin ich krank?", "Was könnte das sein?", "Wie gefährlich ist das?"])(
    "%s",
    (t) => {
      const r = splitDeflect(t);
      expect(r.deflected).toBe(true);
      expect(r.remainder).toBe("");
    },
  );
  it("trennt Frage und Angabe", () => {
    const r = splitDeflect("Ich habe seit drei Tagen Kopfschmerzen. Was habe ich?");
    expect(r.deflected).toBe(true);
    expect(r.remainder).toContain("Kopfschmerzen");
    expect(r.remainder).not.toContain("Was habe");
  });
  it("normale Angaben bleiben unberührt", () => {
    expect(splitDeflect("Es drückt seit gestern links").deflected).toBe(false);
  });
  it("feste Antwort lautet wie vorgegeben", () => {
    expect(DEFLECT_ANSWER).toBe("Das klärt Ihr Arzt. Ich bereite Ihre Angaben dafür auf.");
  });
});

describe("Identifikatoren werden entfernt", () => {
  it("E-Mail, Telefon, Link", () => {
    const t = redactIdentifiers("Mail max@beispiel.test, Tel. 0611 1234567, +49 611 123456, https://x.test/a");
    expect(t).not.toMatch(/@|1234567|123456|https/);
  });
  it("Datumsangaben und kleine Zahlen bleiben", () => {
    expect(redactIdentifiers("seit 12.03. etwa 3 Wochen, 6/10")).toBe("seit 12.03. etwa 3 Wochen, 6/10");
  });
});
