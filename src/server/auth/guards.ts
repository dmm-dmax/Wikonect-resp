import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "../db";
import { COOKIE, destroyAuthSession, resolveAuthSession, type Realm } from "./session";

export async function setSessionCookie(realm: Realm, token: string, expires: Date) {
  (await cookies()).set(COOKIE[realm], token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: realm === "patient" ? "/patient" : "/arzt",
    expires,
  });
}

export async function clearSession(realm: Realm) {
  const jar = await cookies();
  await destroyAuthSession(jar.get(COOKIE[realm])?.value);
  jar.set(COOKIE[realm], "", { path: realm === "patient" ? "/patient" : "/arzt", maxAge: 0 });
}

export async function requirePatient() {
  const id = await resolveAuthSession("patient", (await cookies()).get(COOKIE.patient)?.value);
  if (!id) redirect("/patient/login");
  const [p] = await db().select().from(schema.patient).where(eq(schema.patient.id, id)).limit(1);
  if (!p) redirect("/patient/login");
  return p;
}

export async function requireDoctor() {
  const id = await resolveAuthSession("doctor", (await cookies()).get(COOKIE.doctor)?.value);
  if (!id) redirect("/arzt/login");
  const [d] = await db().select().from(schema.doctor).where(eq(schema.doctor.id, id)).limit(1);
  if (!d) redirect("/arzt/login");
  return d;
}
