import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, lt } from "drizzle-orm";
import { db, schema } from "../db";

export type Realm = "patient" | "doctor";

// Getrennte Cookies je Realm. Ein Patiententoken ist nie als Arzttoken gültig.
export const COOKIE: Record<Realm, string> = { patient: "pt_session", doctor: "dr_session" };
export const TTL_MS: Record<Realm, number> = {
  patient: 8 * 3600_000,
  doctor: 8 * 3600_000,
};

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
export const newToken = () => randomBytes(32).toString("base64url");

export async function createAuthSession(realm: Realm, subjectId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = newToken();
  const expiresAt = new Date(Date.now() + TTL_MS[realm]);
  await db().insert(schema.authSession).values({ realm, subjectId, tokenHash: sha256(token), expiresAt });
  return { token, expiresAt };
}

export async function resolveAuthSession(realm: Realm, token: string | undefined): Promise<string | null> {
  if (!token) return null;
  const [row] = await db()
    .select()
    .from(schema.authSession)
    .where(and(eq(schema.authSession.tokenHash, sha256(token)), eq(schema.authSession.realm, realm), gt(schema.authSession.expiresAt, new Date())))
    .limit(1);
  return row?.subjectId ?? null;
}

export async function destroyAuthSession(token: string | undefined): Promise<void> {
  if (!token) return;
  await db().delete(schema.authSession).where(eq(schema.authSession.tokenHash, sha256(token)));
}

export async function purgeExpiredAuthSessions(): Promise<void> {
  await db().delete(schema.authSession).where(lt(schema.authSession.expiresAt, new Date()));
}
