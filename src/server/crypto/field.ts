import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

/**
 * Feldverschlüsselung AES-256-GCM.
 * Master-Key (ENCRYPTION_KEY, 32 Byte base64) → pro Praxis ein Schlüssel via HKDF.
 * Format: v1.<iv>.<tag>.<ciphertext> (base64url)
 * Annahme: Master-Key kommt im MVP aus der Umgebung. Produktiv: KMS/HSM des Hosters.
 */
function masterKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) throw new Error("ENCRYPTION_KEY fehlt");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("ENCRYPTION_KEY muss 32 Byte (base64) sein");
  return key;
}

const keyCache = new Map<string, Buffer>();

export function practiceKey(practiceId: string): Buffer {
  let k = keyCache.get(practiceId);
  if (!k) {
    k = Buffer.from(hkdfSync("sha256", masterKey(), Buffer.from(practiceId), "anamnese-field-v1", 32));
    keyCache.set(practiceId, k);
  }
  return k;
}

const b64 = (b: Buffer) => b.toString("base64url");

export function encryptField(plain: string, practiceId: string, aad = ""): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", practiceKey(practiceId), iv);
  c.setAAD(Buffer.from(aad));
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", b64(iv), b64(c.getAuthTag()), b64(ct)].join(".");
}

export function decryptField(enc: string, practiceId: string, aad = ""): string {
  const [v, iv, tag, ct] = enc.split(".");
  if (v !== "v1" || !iv || !tag || !ct) throw new Error("Ungültiges Feldformat");
  const d = createDecipheriv("aes-256-gcm", practiceKey(practiceId), Buffer.from(iv, "base64url"));
  d.setAAD(Buffer.from(aad));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([d.update(Buffer.from(ct, "base64url")), d.final()]).toString("utf8");
}

/** Bytes (Dateien) verschlüsseln. Ausgabe: iv(12) | tag(16) | ciphertext */
export function encryptBytes(plain: Buffer, practiceId: string): Buffer {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", practiceKey(practiceId), iv);
  const ct = Buffer.concat([c.update(plain), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), ct]);
}

export function decryptBytes(blob: Buffer, practiceId: string): Buffer {
  const iv = blob.subarray(0, 12);
  const tag = blob.subarray(12, 28);
  const ct = blob.subarray(28);
  const d = createDecipheriv("aes-256-gcm", practiceKey(practiceId), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(ct), d.final()]);
}
