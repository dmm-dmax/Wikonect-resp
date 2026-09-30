import { createDoctor, createPractice } from "@/server/auth/provision";
import { createInvitation, registerPatient } from "@/server/invitation";

export const PW = "synthetisches-passwort-1";
let n = 0;
export const uniq = (p: string) => `${p}-${Date.now()}-${n++}`;

export async function seedDoctor() {
  const practice = await createPractice(uniq("Testpraxis"));
  const doc = await createDoctor(practice.id, `${uniq("arzt")}@example.test`, "Dr. Synthetisch", PW);
  return { practice, doctorId: doc.id, totpSecret: doc.totpSecret, email: null as string | null };
}

export async function seedPatient(opts: { consents?: string[]; appointmentAt?: Date } = {}) {
  const d = await seedDoctor();
  const inv = await createInvitation(d.doctorId, opts.appointmentAt ?? new Date(Date.now() + 3 * 86400_000));
  const email = `${uniq("pat")}@example.test`;
  const r = await registerPatient({
    token: inv.token,
    email,
    password: PW,
    consents: opts.consents ?? ["dialog", "ai_processing", "upload"],
  });
  if (!r.ok) throw new Error(r.error);
  return { ...d, email, patientId: r.patientId, sessionId: r.sessionId, token: inv.token };
}
