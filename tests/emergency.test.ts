import { describe, expect, it } from "vitest";
import { detectEmergency } from "@/server/emergency";

const hit = (...t: string[]) => detectEmergency(t)?.ruleId ?? null;

describe("Notfall-Erkennung (regelbasiert)", () => {
  it.each([
    ["Ich habe starke Brustschmerzen und bekomme kaum Luft", "brustschmerz_atemnot"],
    ["Druck auf der Brust, dazu Atemnot", "brustschmerz_atemnot"],
    ["BRUSTSCHMERZ!!! Luftnot", "brustschmerz_atemnot"],
    ["Mein linker Arm ist plötzlich gelähmt", "laehmung"],
    ["Der Mundwinkel hängt seit heute Morgen", "laehmung"],
    ["Mein Mundwinkel haengt", "laehmung"],
    ["Ich will nicht mehr leben", "suizid"],
    ["Ich denke an Selbstmord", "suizid"],
    ["Er war kurz bewusstlos", "bewusstlosigkeit_krampf"],
    ["Ich hatte einen Krampfanfall", "bewusstlosigkeit_krampf"],
    ["Ich habe Blut erbrochen", "starke_blutung"],
  ])("erkennt: %s", (text, rule) => {
    expect(hit(text)).toBe(rule);
  });

  it("erkennt Kombination über mehrere Nachrichten", () => {
    expect(hit("Ich habe Brustschmerzen seit gestern.", "Dazu habe ich manchmal Atemnot.")).toBe("brustschmerz_atemnot");
  });

  it("Einzelsymptom Brustschmerz ohne Atemnot löst nicht aus", () => {
    expect(hit("Ich habe Brustschmerzen beim Husten")).toBeNull();
  });

  it("Einzelsymptom Atemnot ohne Brustschmerz löst nicht aus", () => {
    expect(hit("Bei Anstrengung bekomme ich Atemnot")).toBeNull();
  });

  it.each([
    "Ich habe Brustschmerzen, aber keine Atemnot",
    "Keine Brustschmerzen, nur Atemnot beim Treppensteigen",
    "Atemnot habe ich nicht, Brustschmerzen schon",
    "Ich hatte noch nie eine Lähmung",
    "Ohne Bewusstlosigkeit",
  ])("Verneinung unterdrückt: %s", (text) => {
    expect(hit(text)).toBeNull();
  });

  it("Verneinung gilt nur lokal: 'kein Fieber, aber Atemnot und Brustschmerz' löst aus", () => {
    expect(hit("Kein Fieber, aber Atemnot und Brustschmerz")).toBe("brustschmerz_atemnot");
  });

  it("Suizidalität wird nie durch Verneinung unterdrückt (Asymmetrie: lieber Fehlalarm)", () => {
    expect(hit("Ich habe keine Suizidgedanken")).toBe("suizid");
  });

  it("harmlose Alltagstexte lösen nicht aus", () => {
    expect(hit("Seit drei Tagen Kopfschmerzen links, stechend, 6/10")).toBeNull();
    expect(hit("Halbseitige Kopfschmerzen, dazu Übelkeit")).toBeNull();
    expect(hit("Bauchschmerzen nach dem Essen")).toBeNull();
  });

  it("robust gegen Schreibweise (Umlaute, Großschreibung, Leerraum)", () => {
    expect(hit("ICH  BIN   GELÄHMT")).toBe("laehmung");
    expect(hit("gelaehmt")).toBe("laehmung");
  });
});
