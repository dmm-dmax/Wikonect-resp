import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { decryptBytes, encryptBytes } from "../crypto/field";

/** Lokaler Speicher (Dev). Dateien liegen nur verschlüsselt auf der Platte. Produktiv: EU-Objektspeicher. */
const dir = () => path.resolve(/*turbopackIgnore: true*/ process.env.STORAGE_DIR ?? "./storage");

export async function putEncrypted(plain: Buffer, practiceId: string): Promise<string> {
  const key = `${randomUUID()}.bin`;
  await mkdir(/*turbopackIgnore: true*/ dir(), { recursive: true });
  await writeFile(path.join(/*turbopackIgnore: true*/ dir(), key), encryptBytes(plain, practiceId), { mode: 0o600 });
  return key;
}

export async function getDecrypted(key: string, practiceId: string): Promise<Buffer> {
  return decryptBytes(await readFile(path.join(/*turbopackIgnore: true*/ dir(), path.basename(key))), practiceId);
}

export async function removeStored(key: string): Promise<void> {
  await rm(path.join(/*turbopackIgnore: true*/ dir(), path.basename(key)), { force: true });
}
