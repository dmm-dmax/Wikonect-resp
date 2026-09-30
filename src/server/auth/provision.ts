import { db, schema } from "../db";
import { encryptField } from "../crypto/field";
import { hashPassword } from "./password";
import { newTotpSecret } from "./totp";

export async function createPractice(name: string, retentionDays = 30) {
  const [p] = await db().insert(schema.practice).values({ name, retentionDays }).returning();
  return p!;
}

/** Legt einen Arzt an. Das TOTP-Secret wird einmalig zurückgegeben (Einrichtung im Authenticator). */
export async function createDoctor(practiceId: string, email: string, displayName: string, password: string) {
  const secret = newTotpSecret();
  const id = crypto.randomUUID();
  await db().insert(schema.doctor).values({
    id,
    practiceId,
    email: email.trim().toLowerCase(),
    displayName,
    pwHash: await hashPassword(password),
    totpSecretEnc: encryptField(secret, practiceId, `totp:${id}`),
  });
  return { id, totpSecret: secret };
}
