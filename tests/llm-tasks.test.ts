import { afterEach, describe, expect, it } from "vitest";
import { setProvider } from "@/server/llm";
import { extractComplaints, extractSlot } from "@/server/llm/tasks";
import type { LlmProvider, LlmRequest } from "@/server/llm/types";

function fake(responder: (req: LlmRequest, call: number) => unknown): LlmProvider & { calls: LlmRequest[] } {
  const calls: LlmRequest[] = [];
  return {
    name: "fake", model: "fake-1", calls,
    async complete(req) {
      calls.push(req);
      const r = responder(req, calls.length);
      if (r instanceof Error) throw r;
      return { json: r, model: "fake-1" };
    },
  };
}
afterEach(() => setProvider(null));

describe("KI-Pipeline: Schema, Zitatprüfung, Filter, Retry, Fallback", () => {
  it("übernimmt saubere Ausgabe samt Prompt-Version und Modell", async () => {
    setProvider(fake(() => ({ quote: "drückt", term: "Druckschmerz" })));
    const r = await extractSlot("qualitaet", "Kopfweh", "Es drückt");
    expect(r.slot).toEqual({ quote: "drückt", term: "Druckschmerz" });
    expect(r.meta).toMatchObject({ blocked: false, promptVersion: "extract-slot@v1", model: "fake-1" });
  });

  it("blockt Diagnosesprache, versucht einmal strict, nimmt dann saubere Ausgabe", async () => {
    const p = fake((_, n) => (n === 1 ? { quote: "drückt", term: "Verdacht auf Angina pectoris" } : { quote: "drückt", term: "Druckschmerz" }));
    setProvider(p);
    const r = await extractSlot("qualitaet", null, "Es drückt");
    expect(p.calls).toHaveLength(2);
    expect(p.calls[0]!.input.strict).toBe(false);
    expect(p.calls[1]!.input.strict).toBe(true);
    expect(r.slot.term).toBe("Druckschmerz");
    expect(r.meta.blocked).toBe(false);
  });

  it("fällt nach zwei Verstößen auf das Patientenzitat ohne Übersetzung zurück", async () => {
    setProvider(fake(() => ({ quote: "drückt", term: "wahrscheinlich Herzinfarkt" })));
    const r = await extractSlot("qualitaet", null, "Es drückt");
    expect(r.slot).toEqual({ quote: "Es drückt", term: null });
    expect(r.meta.blocked).toBe(true);
    expect(r.meta.blockedCategories.length).toBeGreaterThan(0);
  });

  it("blockt Krankheitsnamen auch ohne Diagnose-Floskel", async () => {
    setProvider(fake(() => ({ quote: "Stechen links", term: "Myokardinfarkt" })));
    const r = await extractSlot("qualitaet", null, "Stechen links");
    expect(r.slot.term).toBeNull();
    expect(r.meta.blocked).toBe(true);
  });

  it("verwirft erfundene Zitate (Halluzination)", async () => {
    setProvider(fake(() => ({ quote: "Schmerz strahlt in den Arm aus", term: "Ausstrahlung" })));
    const r = await extractSlot("lokalisation", null, "links am Rücken");
    expect(r.slot.quote).toBe("links am Rücken");
    expect(r.slot.term).toBeNull();
    expect(r.meta.blocked).toBe(true);
  });

  it("verwirft Schema-Verstöße und Provider-Fehler", async () => {
    setProvider(fake(() => ({ foo: "bar" })));
    expect((await extractSlot("beginn", null, "gestern")).meta.blocked).toBe(true);
    setProvider(fake(() => new Error("Timeout")));
    const r = await extractSlot("beginn", null, "gestern");
    expect(r.meta.blocked).toBe(true);
    expect(r.slot.quote).toBe("gestern");
  });

  it("Beschwerden: Diagnose im Fachlabel → Fallback mit Patientenwort, keine Übersetzung", async () => {
    setProvider(fake(() => ({ complaints: [{ labelPatient: "Herzschmerzen", labelClinical: "Angina pectoris", region: "thorax", entries: [] }] })));
    const r = await extractComplaints("Ich habe Herzschmerzen");
    expect(r.meta.blocked).toBe(true);
    expect(r.complaints).toHaveLength(1);
    expect(r.complaints[0]!.labelClinical).toBeNull();
    expect(r.complaints[0]!.labelPatient).toBe("Ich habe Herzschmerzen");
  });

  it("Beschwerden: Diagnose in einem Eintrag blockt die gesamte Ausgabe", async () => {
    setProvider(fake(() => ({
      complaints: [{ labelPatient: "Kopfweh", labelClinical: "Kephalgie", region: "kopf", entries: [{ field: "qualitaet", quote: "dumpf", term: "spricht für Migräne" }] }],
    })));
    const r = await extractComplaints("Kopfweh, dumpf");
    expect(r.meta.blocked).toBe(true);
    expect(r.complaints[0]!.entries).toEqual([]);
  });

  it("nennt der Patient selbst eine Diagnose, bleibt sie im Zitat und fehlt im Term", async () => {
    // Mock liefert nur Symptomebene
    setProvider(null);
    const r = await extractComplaints("Ich glaube, ich habe einen Herzinfarkt, Brustschmerzen links seit gestern");
    const all = JSON.stringify(r.complaints.map((c) => [c.labelClinical, ...c.entries.map((e) => e.term)]));
    expect(all.toLowerCase()).not.toContain("infarkt");
  });
});

describe("MockProvider", () => {
  it("übersetzt Laienbegriffe auf Symptomebene und zitiert wörtlich", async () => {
    const r = await extractComplaints("Seit 3 Tagen Kopfschmerzen links, stechend, 6/10, dazu Übelkeit und Schwindel");
    expect(r.meta.blocked).toBe(false);
    const c = r.complaints[0]!;
    expect(c.labelClinical).toBe("Kephalgie");
    const byField = Object.fromEntries(c.entries.map((e) => [e.field, e]));
    expect(byField.beginn?.quote).toMatch(/^Seit 3 Tagen/i);
    expect(byField.qualitaet?.term).toBe("stechend");
    expect(byField.intensitaet?.term).toBe("NRS 6/10");
    expect(byField.begleitsymptome?.term).toContain("Nausea");
    expect(byField.lokalisation?.term).toContain("links");
  });
  it("Slot: Vorerkrankung wird als Patientenangabe gespiegelt", async () => {
    const r = await extractSlot("vorerkrankungen", null, "Ich habe Bluthochdruck");
    expect(r.slot.term).toContain("Patientenangabe");
    expect(r.meta.blocked).toBe(false);
  });
});
