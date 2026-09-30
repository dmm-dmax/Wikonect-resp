import { describe, expect, it } from "vitest";
import { decryptBytes, decryptField, encryptBytes, encryptField } from "@/server/crypto/field";

const A = "11111111-1111-1111-1111-111111111111";
const B = "22222222-2222-2222-2222-222222222222";

describe("Feldverschlüsselung", () => {
  it("Round-trip", () => {
    const enc = encryptField("Stechender Schmerz links", A);
    expect(enc).not.toContain("Stechender");
    expect(decryptField(enc, A)).toBe("Stechender Schmerz links");
  });
  it("zufälliger IV: gleicher Klartext → verschiedener Chiffretext", () => {
    expect(encryptField("x", A)).not.toBe(encryptField("x", A));
  });
  it("anderer Mandant kann nicht entschlüsseln", () => {
    expect(() => decryptField(encryptField("x", A), B)).toThrow();
  });
  it("AAD-Bindung: anderer Kontext schlägt fehl", () => {
    expect(() => decryptField(encryptField("x", A, "ctx1"), A, "ctx2")).toThrow();
  });
  it("Manipulation wird erkannt", () => {
    const enc = encryptField("Text", A).split(".");
    enc[3] = Buffer.from("manipuliert").toString("base64url");
    expect(() => decryptField(enc.join("."), A)).toThrow();
  });
  it("Bytes Round-trip", () => {
    const buf = Buffer.from([1, 2, 3, 250]);
    expect(decryptBytes(encryptBytes(buf, A), A)).toEqual(buf);
  });
});
