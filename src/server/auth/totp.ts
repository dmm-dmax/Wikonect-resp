import * as OTPAuth from "otpauth";

export function newTotpSecret(): string {
  return new OTPAuth.Secret({ size: 20 }).base32;
}

function totp(secretBase32: string, label = "arzt") {
  return new OTPAuth.TOTP({
    issuer: "Anamnese-MVP",
    label,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secretBase32),
  });
}

export function verifyTotp(secretBase32: string, code: string): boolean {
  if (!/^\d{6}$/.test(code)) return false;
  return totp(secretBase32).validate({ token: code, window: 1 }) !== null;
}

export const currentTotp = (secretBase32: string) => totp(secretBase32).generate();
export const totpUri = (secretBase32: string, label: string) => totp(secretBase32, label).toString();
