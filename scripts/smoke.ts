/**
 * Browser-Durchlauf gegen laufenden Server (Dev-DB, nur synthetische Daten).
 * Aufruf: SMOKE_BASE=http://localhost:3100 tsx --env-file=.env scripts/smoke.ts
 */
import { chromium } from "playwright-core";
import { writeFileSync } from "node:fs";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { createDoctor, createPractice } from "../src/server/auth/provision";
import { currentTotp } from "../src/server/auth/totp";

const base = process.env.SMOKE_BASE ?? "http://localhost:3100";
const shots = process.env.SMOKE_SHOTS ?? "/tmp/claude-0/shots";

async function main() {
  const practice = await createPractice(`Smoke ${Date.now()}`);
  const email = `smoke${Date.now()}@example.test`;
  const d = await createDoctor(practice.id, email, "Dr. Smoke", "smoke-passwort-123");
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox"] });

  // Arzt: Login + Einladung
  const dctx = await browser.newContext({ viewport: { width: 1200, height: 800 } });
  const doc = await dctx.newPage();
  await doc.goto(`${base}/arzt/login`);
  await doc.fill("#email", email);
  await doc.fill("#pw", "smoke-passwort-123");
  await doc.fill("#totp", currentTotp(d.totpSecret));
  await doc.click("button:has-text('Anmelden')");
  await doc.waitForURL(`${base}/arzt`);

  const invite = async () => {
    await doc.goto(`${base}/arzt`);
    await doc.fill("#at", new Date(Date.now() + 2 * 86400_000).toISOString().slice(0, 16));
    await doc.click("button:has-text('Einladungslink erzeugen')");
    return (await doc.locator("code").innerText()).replace("http://localhost:3000", base);
  };
  const register = async (link: string) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 800 } });
    const pg = await ctx.newPage();
    await pg.goto(link);
    await pg.fill("#email", `pat${Date.now()}${Math.floor(Math.random() * 1e6)}@example.test`);
    await pg.fill("#pw", "patient-passwort-123");
    for (const box of await pg.locator("input[name=consent]").all()) await box.check();
    await pg.click("button:has-text('Konto anlegen')");
    await pg.waitForURL(`${base}/patient`);
    await pg.click("text=Dialog starten");
    await pg.waitForURL(`${base}/patient/dialog`);
    return pg;
  };
  const send = async (pg: import("playwright-core").Page, text: string, expectText: string) => {
    await pg.fill("#text", text);
    await pg.click("button:has-text('Senden')");
    await pg.waitForSelector(`text=${expectText}`);
  };

  // Ablauf A: Dialog, Deflect, Upload, Abgabe, Arztansicht
  const pat = await register(await invite());
  await send(pat, "Seit 3 Tagen Kopfschmerzen links, stechend, 6/10, dazu Übelkeit", "Wie lange dauert");
  await send(pat, "Was habe ich?", "Das klärt Ihr Arzt");
  await pat.screenshot({ path: `${shots}/patient-dialog.png`, fullPage: true });
  console.log("Dialog, Fortschritt, Deflect: ok");

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const page = pdf.addPage([595, 842]);
  ["Laborbefund (synthetisch)", "Kreatinin 0,9 mg/dl 0,7 - 1,2", "CRP 12,4 mg/l < 5,0", "TSH 2,1 mU/l 0,4 - 4,0"].forEach((l, i) => page.drawText(l, { x: 50, y: 800 - i * 16, size: 10, font }));
  writeFileSync(`${shots}/labor.pdf`, await pdf.save({ useObjectStreams: false }));
  await pat.setInputFiles("input[type=file]", `${shots}/labor.pdf`);
  await pat.click("button:has-text('Hochladen')");
  await pat.waitForSelector("text=3 Werte übernommen");
  console.log("Upload + Laborwerte: ok");

  const answers: [RegExp, string][] = [[/weitere Beschwerden/, "nein"], [/Vorerkrankungen/, "Ich habe Bluthochdruck"], [/Medikamente/, "Ramipril 5 mg morgens"], [/Allergien/, "nein"]];
  for (let i = 0; i < 25; i++) {
    if (await pat.locator("button:has-text('An Praxis senden')").count()) break;
    const last = (await pat.locator("ol > li").last().innerText()).trim();
    const a = answers.find(([re]) => re.test(last))?.[1] ?? "weiß nicht";
    const n = await pat.locator("ol > li").count();
    await pat.fill("#text", a);
    await pat.click("button:has-text('Senden')");
    await pat.waitForFunction((c) => document.querySelectorAll("ol > li").length > c, n);
  }
  await pat.click("button:has-text('An Praxis senden')");
  await pat.waitForSelector("text=Ihre Angaben sind bei Ihrer Praxis");
  console.log("Abgabe: ok");

  await doc.goto(`${base}/arzt`);
  await doc.click("a:has-text('öffnen')");
  await doc.waitForSelector("text=Originalaussage Patient");
  await doc.screenshot({ path: `${shots}/arzt-ansicht.png`, fullPage: true });
  console.log("Arztansicht: ok");

  // Ablauf B: Notfall-Abbruch
  const pat2 = await register(await invite());
  await send(pat2, "Jetzt habe ich Brustschmerzen und Atemnot", "112");
  await pat2.screenshot({ path: `${shots}/patient-notfall.png`, fullPage: true });
  console.log("Notfall-Abbruch: ok");
  await browser.close();
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
