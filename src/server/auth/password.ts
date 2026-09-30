import { hash, verify } from "@node-rs/argon2";

// argon2id (Algorithm 2), OWASP-konforme Parameter
const OPTS = { algorithm: 2, memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export const MIN_PASSWORD_LENGTH = 10;

export function passwordProblem(pw: string): string | null {
  if (pw.length < MIN_PASSWORD_LENGTH) return `Mindestens ${MIN_PASSWORD_LENGTH} Zeichen.`;
  if (pw.length > 200) return "Zu lang.";
  return null;
}

export const hashPassword = (pw: string) => hash(pw, OPTS);

export async function verifyPassword(stored: string, pw: string): Promise<boolean> {
  try {
    return await verify(stored, pw);
  } catch {
    return false;
  }
}

let dummy: Promise<string> | undefined;
/** Gleicht die Laufzeit bei unbekannter E-Mail an. */
export async function burnPasswordCheck(pw: string): Promise<void> {
  dummy ??= hashPassword("dummy-password-not-used");
  await verifyPassword(await dummy, pw);
}
