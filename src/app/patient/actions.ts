"use server";
import { redirect } from "next/navigation";
import { loginPatient } from "@/server/auth/login";
import { clearSession, requirePatient, setSessionCookie } from "@/server/auth/guards";
import { registerPatient } from "@/server/invitation";
import { revokeConsent } from "@/server/consent";
import { createAuthSession } from "@/server/auth/session";

export type FormState = { error?: string } | undefined;

export async function loginAction(_: FormState, fd: FormData): Promise<FormState> {
  const r = await loginPatient(String(fd.get("email") ?? ""), String(fd.get("password") ?? ""));
  if (!r.ok) return { error: r.error };
  await setSessionCookie("patient", r.token, r.expiresAt);
  redirect("/patient");
}

export async function registerAction(_: FormState, fd: FormData): Promise<FormState> {
  const r = await registerPatient({
    token: String(fd.get("token") ?? ""),
    email: String(fd.get("email") ?? ""),
    password: String(fd.get("password") ?? ""),
    consents: fd.getAll("consent").map(String),
  });
  if (!r.ok) return { error: r.error };
  const s = await createAuthSession("patient", r.patientId);
  await setSessionCookie("patient", s.token, s.expiresAt);
  redirect("/patient");
}

export async function logoutAction() {
  await clearSession("patient");
  redirect("/patient/login");
}

export async function revokeAction(fd: FormData) {
  const p = await requirePatient();
  await revokeConsent(p.id, String(fd.get("purpose")));
  redirect("/patient");
}
