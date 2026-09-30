"use server";
import { redirect } from "next/navigation";
import { loginPatient } from "@/server/auth/login";
import { clearSession, requirePatient, setSessionCookie } from "@/server/auth/guards";
import { registerPatient } from "@/server/invitation";
import { revokeConsent } from "@/server/consent";
import { createAuthSession } from "@/server/auth/session";
import { handlePatientMessage, submitSession } from "@/server/dialog/service";
import { deleteDocument, uploadDocument } from "@/server/upload/service";
import { MAX_FILE_BYTES } from "@/server/upload/validate";

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

export async function sendAction(_: FormState, fd: FormData): Promise<FormState> {
  const p = await requirePatient();
  const r = await handlePatientMessage(String(fd.get("sessionId") ?? ""), p.id, String(fd.get("text") ?? ""));
  if (r.kind === "error") return { error: r.error };
  redirect("/patient/dialog"); // lädt Verlauf, Notfall-Ansicht oder nächste Frage
}

export async function submitAction(fd: FormData) {
  const p = await requirePatient();
  await submitSession(String(fd.get("sessionId") ?? ""), p.id);
  redirect("/patient/dialog");
}

export async function uploadAction(_: FormState, fd: FormData): Promise<FormState> {
  const p = await requirePatient();
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Bitte wählen Sie eine Datei." };
  if (file.size > MAX_FILE_BYTES) return { error: "Die Datei ist größer als 10 MB." };
  const complaintId = String(fd.get("complaintId") ?? "") || null;
  const r = await uploadDocument({
    sessionId: String(fd.get("sessionId") ?? ""),
    patientId: p.id,
    filename: file.name,
    declaredMime: file.type,
    bytes: Buffer.from(await file.arrayBuffer()),
    complaintId,
  });
  if (!r.ok) return { error: r.error };
  redirect("/patient/dialog");
}

export async function deleteDocumentAction(fd: FormData) {
  const p = await requirePatient();
  await deleteDocument(String(fd.get("documentId") ?? ""), p.id);
  redirect("/patient/dialog");
}
