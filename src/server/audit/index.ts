import { createHash } from "node:crypto";
import { asc, sql } from "drizzle-orm";
import { db, schema, type Conn, type Db } from "../db";

/**
 * Append-only Audit-Log mit Hash-Kette.
 * Enthält nie Gesundheitsinhalte, nur: wer, was, wann, Objekttyp/-ID.
 */
export type AuditEvent = {
  actorType: "patient" | "doctor" | "system";
  actorId?: string | null;
  action: string;
  objectType?: string | null;
  objectId?: string | null;
};

const GENESIS = "0".repeat(64);

export function computeHash(prev: string, e: AuditEvent, ts: Date): string {
  return createHash("sha256")
    .update(
      JSON.stringify([prev, ts.toISOString(), e.actorType, e.actorId ?? null, e.action, e.objectType ?? null, e.objectId ?? null]),
    )
    .digest("hex");
}

export async function audit(e: AuditEvent, conn: Conn = db()): Promise<void> {
  await conn.transaction(async (tx) => {
    // Serialisiert Schreibzugriffe, damit die Kette linear bleibt.
    await tx.execute(sql`select pg_advisory_xact_lock(727001)`);
    const [last] = await tx
      .select({ hash: schema.auditLog.hash })
      .from(schema.auditLog)
      .orderBy(sql`${schema.auditLog.seq} desc`)
      .limit(1);
    const prev = last?.hash ?? GENESIS;
    const ts = new Date(Math.floor(Date.now() / 1000) * 1000);
    await tx.insert(schema.auditLog).values({
      ts,
      actorType: e.actorType,
      actorId: e.actorId ?? null,
      action: e.action,
      objectType: e.objectType ?? null,
      objectId: e.objectId ?? null,
      prevHash: prev,
      hash: computeHash(prev, e, ts),
    });
  });
}

export async function verifyAuditChain(conn: Db = db()): Promise<{ ok: boolean; brokenAtSeq?: number }> {
  const rows = await conn.select().from(schema.auditLog).orderBy(asc(schema.auditLog.seq));
  let prev = GENESIS;
  for (const r of rows) {
    const expected = computeHash(
      prev,
      { actorType: r.actorType as AuditEvent["actorType"], actorId: r.actorId, action: r.action, objectType: r.objectType, objectId: r.objectId },
      r.ts,
    );
    if (r.prevHash !== prev || r.hash !== expected) return { ok: false, brokenAtSeq: r.seq };
    prev = r.hash;
  }
  return { ok: true };
}
