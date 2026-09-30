import { and, eq, inArray, lt, ne } from "drizzle-orm";
import { db, schema } from "../db";
import { audit } from "../audit";
import { removeStored } from "../upload/storage";

/**
 * Löschkonzept: Sitzungsdaten werden nach `delete_after` (Termin + retention_days)
 * gelöscht, bei Widerruf sofort. Die Sitzungszeile bleibt als Grabstein (Status DELETED, keine Inhalte).
 */
export async function deleteSessionData(
  sessionId: string,
  reason: string,
  opts: { onlyDocuments?: boolean } = {},
): Promise<void> {
  const docs = await db().select({ id: schema.document.id, key: schema.document.storageKey }).from(schema.document).where(eq(schema.document.sessionId, sessionId));
  for (const d of docs) await removeStored(d.key);
  if (docs.length) await db().delete(schema.document).where(inArray(schema.document.id, docs.map((d) => d.id)));
  if (!opts.onlyDocuments) {
    await db().delete(schema.summary).where(eq(schema.summary.sessionId, sessionId));
    await db().delete(schema.message).where(eq(schema.message.sessionId, sessionId));
    await db().delete(schema.complaint).where(eq(schema.complaint.sessionId, sessionId)); // entry, lab_value via cascade
    await db().update(schema.anamnesisSession).set({ status: "DELETED", dialogState: null }).where(eq(schema.anamnesisSession.id, sessionId));
  }
  await audit({ actorType: "system", action: `session.deleted.${reason}`, objectType: "anamnesis_session", objectId: sessionId });
}

export async function purgeExpiredSessions(now = new Date()): Promise<number> {
  const due = await db()
    .select({ id: schema.anamnesisSession.id })
    .from(schema.anamnesisSession)
    .where(and(lt(schema.anamnesisSession.deleteAfter, now), ne(schema.anamnesisSession.status, "DELETED")));
  for (const s of due) await deleteSessionData(s.id, "retention");
  return due.length;
}
