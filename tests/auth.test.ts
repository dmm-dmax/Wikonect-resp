import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, schema } from "@/server/db";
import { loginDoctor, loginPatient } from "@/server/auth/login";
import { resolveAuthSession } from "@/server/auth/session";
import { currentTotp } from "@/server/auth/totp";
import { createDoctor, createPractice } from "@/server/auth/provision";
import { PW, seedPatient, uniq } from "./helpers";

describe("Patient-Login", () => {
  it("Erfolg mit korrekten Daten, Session nur im Patienten-Realm gültig", async () => {
    const p = await seedPatient();
    const r = await loginPatient(p.email, PW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(await resolveAuthSession("patient", r.token)).toBe(p.patientId);
    expect(await resolveAuthSession("doctor", r.token)).toBeNull();
  });
  it("falsches Passwort und unbekannte E-Mail liefern dieselbe Meldung", async () => {
    const p = await seedPatient();
    const a = await loginPatient(p.email, "falsch-falsch-falsch");
    const b = await loginPatient("niemand@example.test", "falsch-falsch-falsch");
    expect(a).toEqual(b);
  });
  it("sperrt nach 5 Fehlversuchen", async () => {
    const p = await seedPatient();
    for (let i = 0; i < 5; i++) await loginPatient(p.email, "falsch-falsch-falsch");
    const r = await loginPatient(p.email, PW);
    expect(r.ok).toBe(false);
  });
});

describe("Arzt-Login", () => {
  async function doctor() {
    const practice = await createPractice(uniq("P"));
    const email = `${uniq("dr")}@example.test`;
    const d = await createDoctor(practice.id, email, "Dr. Test", PW);
    return { email, ...d };
  }
  it("verlangt Passwort und TOTP", async () => {
    const d = await doctor();
    expect((await loginDoctor(d.email, PW, "000000")).ok).toBe(false);
    const r = await loginDoctor(d.email, PW, currentTotp(d.totpSecret));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(await resolveAuthSession("doctor", r.token)).toBe(d.id);
      expect(await resolveAuthSession("patient", r.token)).toBeNull();
    }
  });
  it("richtiger Code bei falschem Passwort scheitert", async () => {
    const d = await doctor();
    expect((await loginDoctor(d.email, "falsch-falsch-falsch", currentTotp(d.totpSecret))).ok).toBe(false);
  });
  it("TOTP-Secret liegt verschlüsselt in der DB", async () => {
    const d = await doctor();
    const [row] = await db().select().from(schema.doctor).where(eq(schema.doctor.id, d.id));
    expect(row!.totpSecretEnc).not.toContain(d.totpSecret);
  });
});
