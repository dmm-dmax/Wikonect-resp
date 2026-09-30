import { randomBytes } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db, schema } from "../db";
import { audit } from "../audit";
import { hashPassword, passwordProblem } from "../auth/password";
import { newToken, sha256 } from "../auth/session";
import { CONSENT_VERSION, grantConsents, missingRequired } from "../consent";

const INVITATION_TTL_MS = 14 * 24 * 3600_000;
const SCHEMA_VERSION = "anamnese-schema-v1";

export async function createInvitation(doctorId: string, appointmentAt: Date): Promise<{ token: string; id: string }> {
  const [d] = await db().select().from(schema.doctor).where(eq(schema.doctor.id, doctorId)).limit(1);
  if (!d) throw new Error("Arzt nicht gefunden");
  const token = newToken();
  const [inv] = await db()
    .insert(schema.invitation)
    .values({
      practiceId: d.practiceId,
      doctorId,
      tokenHash: sha256(token),
      appointmentAt,
      expiresAt: new Date(Math.min(appointmentAt.getTime(), Date.now() + INVITATION_TTL_MS)),
    })
    .returning({ id: schema.invitation.id });
  await audit({ actorType: "doctor", actorId: doctorId, action: "invitation.created", objectType: "invitation", objectId: inv!.id });
  return { token, id: inv!.id };
}

export async function findValidInvitation(token: string) {
  const [inv] = await db()
    .select()
    .from(schema.invitation)
    .where(and(eq(schema.invitation.tokenHash, sha256(token)), isNull(schema.invitation.usedAt), gt(schema.invitation.expiresAt, new Date())))
    .limit(1);
  return inv ?? null;
}

export type RegisterResult = { ok: true; patientId: string; sessionId: string } | { ok: false; error: string };

/**
 * Registrierung über Einladungslink. Einwilligung ist Voraussetzung:
 * ohne die Pflichtzwecke wird weder ein Konto noch eine Sitzung angelegt.
 */
export async function registerPatient(input: {
  token: string;
  email: string;
  password: string;
  consents: string[];
}): Promise<RegisterResult> {
  const email = input.email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, error: "Ungültige E-Mail-Adresse." };
  const pwProblem = passwordProblem(input.password);
  if (pwProblem) return { ok: false, error: pwProblem };
  if (missingRequired(input.consents).length) return { ok: false, error: "Ohne Einwilligung ist der Dialog nicht möglich." };

  const inv = await findValidInvitation(input.token);
  if (!inv) return { ok: false, error: "Der Einladungslink ist ungültig oder abgelaufen." };
  const [existing] = await db().select({ id: schema.patient.id }).from(schema.patient).where(eq(schema.patient.email, email)).limit(1);
  if (existing) return { ok: false, error: "Für diese E-Mail gibt es schon ein Konto. Bitte melden Sie sich an." };

  const pwHash = await hashPassword(input.password);
  const [practice] = await db().select().from(schema.practice).where(eq(schema.practice.id, inv.practiceId)).limit(1);
  if (!practice) return { ok: false, error: "Praxis nicht gefunden." };

  const result = await db().transaction(async (tx) => {
    // Einladung atomar verbrauchen (verhindert doppelte Nutzung)
    const claimed = await tx
      .update(schema.invitation)
      .set({ usedAt: new Date() })
      .where(and(eq(schema.invitation.id, inv.id), isNull(schema.invitation.usedAt)))
      .returning({ id: schema.invitation.id });
    if (claimed.length === 0) return null;
    const [p] = await tx
      .insert(schema.patient)
      .values({ practiceId: inv.practiceId, email, pwHash, pseudonym: `P-${randomBytes(5).toString("hex")}` })
      .returning({ id: schema.patient.id });
    await tx.update(schema.invitation).set({ usedByPatientId: p!.id }).where(eq(schema.invitation.id, inv.id));
    await grantConsents(p!.id, input.consents, tx);
    const deleteAfter = new Date(inv.appointmentAt.getTime() + practice.retentionDays * 86400_000);
    const [s] = await tx
      .insert(schema.anamnesisSession)
      .values({
        patientId: p!.id,
        doctorId: inv.doctorId,
        invitationId: inv.id,
        schemaVersion: SCHEMA_VERSION,
        appointmentAt: inv.appointmentAt,
        deleteAfter,
      })
      .returning({ id: schema.anamnesisSession.id });
    return { patientId: p!.id, sessionId: s!.id };
  });
  if (!result) return { ok: false, error: "Der Einladungslink wurde bereits verwendet." };
  await audit({ actorType: "patient", actorId: result.patientId, action: "patient.registered", objectType: "invitation", objectId: inv.id });
  return { ok: true, ...result };
}

export { CONSENT_VERSION };
