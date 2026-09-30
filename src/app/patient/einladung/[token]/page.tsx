import { CONSENT_INFO, CONSENT_PURPOSES } from "@/server/consent";
import { findValidInvitation } from "@/server/invitation";
import { RegisterForm } from "./form";

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const inv = await findValidInvitation(token);
  if (!inv) {
    return (
      <main className="mx-auto max-w-md p-6">
        <h1 className="mb-2 text-2xl font-semibold">Link ungültig</h1>
        <p>Der Einladungslink ist abgelaufen oder wurde schon verwendet. Bitte fragen Sie Ihre Praxis nach einem neuen Link.</p>
      </main>
    );
  }
  return (
    <main className="mx-auto max-w-md p-6">
      <h1 className="mb-2 text-2xl font-semibold">Termin vorbereiten</h1>
      <p className="mb-2 text-slate-600">Sie beschreiben Ihre Beschwerden. Ihre Ärztin / Ihr Arzt bekommt sie geordnet vor dem Termin.</p>
      <p className="mb-6 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Diese App stellt keine Diagnose und gibt keine Bewertung. Bei akuten Beschwerden: Notruf 112.</p>
      <RegisterForm token={token} purposes={CONSENT_PURPOSES} info={CONSENT_INFO} />
    </main>
  );
}
