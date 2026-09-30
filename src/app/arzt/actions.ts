"use server";
import { redirect } from "next/navigation";
import { loginDoctor } from "@/server/auth/login";
import { clearSession, requireDoctor, setSessionCookie } from "@/server/auth/guards";
import { createInvitation } from "@/server/invitation";

export type LoginState = { error?: string } | undefined;
export type InviteState = { error?: string; link?: string } | undefined;

export async function loginAction(_: LoginState, fd: FormData): Promise<LoginState> {
  const r = await loginDoctor(String(fd.get("email") ?? ""), String(fd.get("password") ?? ""), String(fd.get("totp") ?? ""));
  if (!r.ok) return { error: r.error };
  await setSessionCookie("doctor", r.token, r.expiresAt);
  redirect("/arzt");
}

export async function logoutAction() {
  await clearSession("doctor");
  redirect("/arzt/login");
}

export async function inviteAction(_: InviteState, fd: FormData): Promise<InviteState> {
  const d = await requireDoctor();
  const when = new Date(String(fd.get("appointmentAt") ?? ""));
  if (Number.isNaN(when.getTime()) || when.getTime() < Date.now()) return { error: "Bitte einen Termin in der Zukunft wählen." };
  const { token } = await createInvitation(d.id, when);
  const base = process.env.APP_BASE_URL ?? "http://localhost:3000";
  return { link: `${base}/patient/einladung/${token}` };
}
