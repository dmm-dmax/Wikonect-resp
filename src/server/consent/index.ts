import { and, eq, isNull } from "drizzle-orm";
import config from "@config/consent.json";
import { db, schema, type Conn } from "../db";
import { audit } from "../audit";
import { deleteSessionData } from "../retention";

export const CONSENT_VERSION = config.version;
export const CONSENT_PURPOSES = config.purposes;
export const CONSENT_INFO = config.info;
export const REQUIRED_PURPOSES = config.purposes.filter((p) => p.required).map((p) => p.id);

export async function activeConsents(patientId: string, conn: Conn = db()): Promise<Set<string>> {
  const rows = await conn
    .select({ purpose: schema.consent.purpose })
    .from(schema.consent)
    .where(and(eq(schema.consent.patientId, patientId), eq(schema.consent.version, CONSENT_VERSION), isNull(schema.consent.revokedAt)));
  return new Set(rows.map((r) => r.purpose));
}

export async function hasRequiredConsents(patientId: string, conn: Conn = db()): Promise<boolean> {
  const active = await activeConsents(patientId, conn);
  return REQUIRED_PURPOSES.every((p) => active.has(p));
}

export function missingRequired(granted: string[]): string[] {
  return REQUIRED_PURPOSES.filter((p) => !granted.includes(p));
}

export async function grantConsents(patientId: string, purposes: string[], conn: Conn = db()): Promise<void> {
  const valid = purposes.filter((p) => config.purposes.some((x) => x.id === p));
  if (valid.length === 0) return;
  await conn.insert(schema.consent).values(valid.map((purpose) => ({ patientId, purpose, version: CONSENT_VERSION })));
  for (const purpose of valid) {
    await audit({ actorType: "patient", actorId: patientId, action: `consent.granted.${purpose}`, objectType: "patient", objectId: patientId }, conn);
  }
}

/**
 * Widerruf. Wird `dialog` oder `ai_processing` widerrufen, entfallen die Rechtsgrundlagen:
 * alle Sitzungsdaten des Patienten werden sofort gelöscht.
 * Widerruf von `upload` löscht nur die Anhänge der Sitzungen.
 */
export async function revokeConsent(patientId: string, purpose: string): Promise<void> {
  await db()
    .update(schema.consent)
    .set({ revokedAt: new Date() })
    .where(and(eq(schema.consent.patientId, patientId), eq(schema.consent.purpose, purpose), isNull(schema.consent.revokedAt)));
  await audit({ actorType: "patient", actorId: patientId, action: `consent.revoked.${purpose}`, objectType: "patient", objectId: patientId });
  const sessions = await db().select({ id: schema.anamnesisSession.id }).from(schema.anamnesisSession).where(eq(schema.anamnesisSession.patientId, patientId));
  for (const s of sessions) {
    await deleteSessionData(s.id, purpose === "upload" ? "consent_revoked_upload" : "consent_revoked", purpose === "upload" ? { onlyDocuments: true } : {});
  }
}
