/**
 * Browser-Durchlauf gegen laufenden Server (Dev-DB, nur synthetische Daten).
 * Aufruf: SMOKE_BASE=http://localhost:3100 tsx --env-file=.env scripts/smoke.ts
 */
import { chromium } from "playwright-core";
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
  const when = new Date(Date.now() + 2 * 86400_000).toISOString().slice(0, 16);
  await doc.fill("#at", when);
  await doc.click("button:has-text('Einladungslink erzeugen')");
  const link = (await doc.locator("code").innerText()).replace("http://localhost:3000", base);
  console.log("Einladungslink erzeugt");

  // Patient: Registrierung mit Einwilligung, Dialog
  const pctx = await browser.newContext({ viewport: { width: 390, height: 800 } });
  const pat = await pctx.newPage();
  await pat.goto(link);
  await pat.fill("#email", `pat${Date.now()}@example.test`);
  await pat.fill("#pw", "patient-passwort-123");
  for (const box of await pat.locator("input[name=consent]").all()) await box.check();
  await pat.click("button:has-text('Konto anlegen')");
  await pat.waitForURL(`${base}/patient`);
  await pat.click("text=Dialog starten");
  await pat.waitForURL(`${base}/patient/dialog`);
  await pat.fill("#text", "Seit 3 Tagen Kopfschmerzen links, stechend, 6/10");
  await pat.click("button:has-text('Senden')");
  await pat.waitForSelector("text=Wie lange dauert");
  await pat.fill("#text", "Was habe ich?");
  await pat.click("button:has-text('Senden')");
  await pat.waitForSelector("text=Das klärt Ihr Arzt");
  await pat.screenshot({ path: `${shots}/patient-dialog.png`, fullPage: true });
  console.log("Dialog, Fortschritt, Deflect: ok");

  await pat.fill("#text", "Jetzt habe ich Brustschmerzen und Atemnot");
  await pat.click("button:has-text('Senden')");
  await pat.waitForSelector("text=112");
  await pat.screenshot({ path: `${shots}/patient-notfall.png`, fullPage: true });
  console.log("Notfall-Abbruch: ok");
  await browser.close();
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
