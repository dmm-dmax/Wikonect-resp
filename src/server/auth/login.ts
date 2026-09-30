import { eq } from "drizzle-orm";
import { db, schema } from "../db";
import { audit } from "../audit";
import { decryptField } from "../crypto/field";
import { burnPasswordCheck, verifyPassword } from "./password";
import { createAuthSession } from "./session";
import { verifyTotp } from "./totp";

const MAX_ATTEMPTS = 5;
const LOCK_MS = 15 * 60_000;

export type LoginResult =
  | { ok: true; token: string; expiresAt: Date; subjectId: string }
  | { ok: false; error: string };

const GENERIC = "E-Mail oder Passwort falsch.";

export async function loginPatient(email: string, password: string): Promise<LoginResult> {
  const mail = email.trim().toLowerCase();
  const [p] = await db().select().from(schema.patient).where(eq(schema.patient.email, mail)).limit(1);
  if (!p) {
    await burnPasswordCheck(password);
    return { ok: false, error: GENERIC };
  }
  if (p.lockedUntil && p.lockedUntil > new Date()) return { ok: false, error: "Konto vorübergehend gesperrt." };
  if (!(await verifyPassword(p.pwHash, password))) {
    await registerFailure("patient", p.id, p.failedAttempts);
    return { ok: false, error: GENERIC };
  }
  await db().update(schema.patient).set({ failedAttempts: 0, lockedUntil: null }).where(eq(schema.patient.id, p.id));
  const s = await createAuthSession("patient", p.id);
  await audit({ actorType: "patient", actorId: p.id, action: "auth.login", objectType: "patient", objectId: p.id });
  return { ok: true, ...s, subjectId: p.id };
}

export async function loginDoctor(email: string, password: string, totpCode: string): Promise<LoginResult> {
  const mail = email.trim().toLowerCase();
  const [d] = await db().select().from(schema.doctor).where(eq(schema.doctor.email, mail)).limit(1);
  if (!d) {
    await burnPasswordCheck(password);
    return { ok: false, error: GENERIC };
  }
  if (d.lockedUntil && d.lockedUntil > new Date()) return { ok: false, error: "Konto vorübergehend gesperrt." };
  const pwOk = await verifyPassword(d.pwHash, password);
  const totpOk = pwOk && verifyTotp(decryptField(d.totpSecretEnc, d.practiceId, `totp:${d.id}`), totpCode.trim());
  if (!pwOk || !totpOk) {
    await registerFailure("doctor", d.id, d.failedAttempts);
    return { ok: false, error: "Zugangsdaten oder Code falsch." };
  }
  await db().update(schema.doctor).set({ failedAttempts: 0, lockedUntil: null }).where(eq(schema.doctor.id, d.id));
  const s = await createAuthSession("doctor", d.id);
  await audit({ actorType: "doctor", actorId: d.id, action: "auth.login", objectType: "doctor", objectId: d.id });
  return { ok: true, ...s, subjectId: d.id };
}

async function registerFailure(realm: "patient" | "doctor", id: string, current: number) {
  const attempts = current + 1;
  const locked = attempts >= MAX_ATTEMPTS ? new Date(Date.now() + LOCK_MS) : null;
  const table = realm === "patient" ? schema.patient : schema.doctor;
  await db().update(table).set({ failedAttempts: locked ? 0 : attempts, lockedUntil: locked }).where(eq(table.id, id));
  await audit({ actorType: "system", action: locked ? "auth.locked" : "auth.failed", objectType: realm, objectId: id });
}
