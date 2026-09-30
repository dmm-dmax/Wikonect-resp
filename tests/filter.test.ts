import { describe, expect, it } from "vitest";
import { checkClinicalTerm, checkText } from "@/server/filter";

const cats = (t: string) => [...new Set(checkText(t).map((h) => h.category))];

describe("Output-Filter: blockt Diagnose-/Ursachen-/Bewertungssprache", () => {
  it.each([
    ["Das spricht für eine Entzündung", "diagnose"],
    ["Verdacht auf Herzinfarkt", "diagnose"],
    ["V. a. Gastritis", "diagnose"],
    ["Differentialdiagnostisch kommt X in Betracht", "diagnose"],
    ["Dies deutet auf eine Infektion hin", "diagnose"],
    ["Hinweis auf eine Stoffwechselstörung", "diagnose"],
    ["typisch für Migräne", "diagnose"],
    ["Die Ursache sind Verspannungen", "ursache"],
    ["Schmerzen aufgrund von Überlastung", "ursache"],
    ["verursacht durch Stress", "ursache"],
    ["Das könnte sein", "wahrscheinlichkeit"],
    ["wahrscheinlich harmlos", "wahrscheinlichkeit"],
    ["möglicherweise Stress", "wahrscheinlichkeit"],
    ["vermutlich muskulär", "wahrscheinlichkeit"],
    ["Das ist dringend abzuklären", "dringlichkeit"],
    ["akute Beschwerden", "dringlichkeit"],
    ["lebensbedrohlich", "dringlichkeit"],
    ["harmlos", "dringlichkeit"],
    ["Sie sollten einen Arzt aufsuchen", "empfehlung"],
    ["Wir empfehlen ein Röntgenbild", "empfehlung"],
    ["Therapie mit Schmerzmitteln", "empfehlung"],
    ["Nehmen Sie das Medikament ein", "empfehlung"],
    ["Gehen Sie zum Notarzt", "empfehlung"],
    ["Der Wert ist erhöht", "interpretation"],
    ["Befund ist auffällig", "interpretation"],
    ["pathologischer Befund", "interpretation"],
    ["außerhalb der Norm", "interpretation"],
  ])("blockt: %s", (text, cat) => {
    expect(cats(text)).toContain(cat);
  });

  it("erkennt Umschreibung ohne Umlaut (koennte, moeglich)", () => {
    expect(checkText("Das koennte Stress sein").length).toBeGreaterThan(0);
    expect(checkText("moeglicherweise").length).toBeGreaterThan(0);
  });

  it("erkennt Verschleierung mit Zero-Width-Zeichen", () => {
    expect(checkText("wahr​scheinlich").length).toBeGreaterThan(0);
  });

  it("lässt rein beschreibende Fachsprache durch", () => {
    for (const t of [
      "thorakaler Druckschmerz links",
      "Dyspnoe bei Belastung",
      "seit 3 Tagen",
      "stechend, belastungsabhängig",
      "NRS 6/10",
      "kontinuierlich",
      "Nausea; Schwindel; Photophobie",
      "Kephalgie",
      "Dorsalgie lumbal",
      "intermittierend, nächtliche Betonung",
    ]) {
      expect(checkText(t), t).toEqual([]);
      expect(checkClinicalTerm(t, "qualitaet"), t).toEqual([]);
    }
  });
});

describe("Krankheitsnamen in Fachtermen", () => {
  it.each(["Herzinfarkt", "Myokardinfarkt", "Angina pectoris", "Migräne", "Gastritis", "Bronchitis", "Pneumonie", "Bandscheibenvorfall", "Karzinom", "Schlaganfall", "Appendizitis", "Burnout"])(
    "blockt %s in Beschwerdefeldern",
    (term) => {
      expect(checkClinicalTerm(term, "qualitaet").some((h) => h.category === "krankheitsname")).toBe(true);
    },
  );
  it("erlaubt Symptomebene: Kephalgie, Dyspnoe, Palpitationen, Diarrhö", () => {
    for (const t of ["Kephalgie", "Dyspnoe", "Palpitationen", "Diarrhö", "Gonalgie", "Vertigo"]) {
      expect(checkClinicalTerm(t, "lokalisation"), t).toEqual([]);
    }
  });
  it("Vorerkrankungen: vom Patienten genannte Diagnosen sind erlaubt, Bewertungssprache nicht", () => {
    expect(checkClinicalTerm("Diabetes mellitus (Patientenangabe)", "vorerkrankungen")).toEqual([]);
    expect(checkClinicalTerm("wahrscheinlich Diabetes", "vorerkrankungen").length).toBeGreaterThan(0);
  });
});
