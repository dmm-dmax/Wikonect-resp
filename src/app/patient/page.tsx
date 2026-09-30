import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { requirePatient } from "@/server/auth/guards";
import { activeConsents, CONSENT_PURPOSES, hasRequiredConsents } from "@/server/consent";
import { db, schema } from "@/server/db";
import { logoutAction, revokeAction } from "./actions";

export default async function Page() {
  const p = await requirePatient();
  const active = await activeConsents(p.id);
  const ok = await hasRequiredConsents(p.id);
  const [s] = await db().select().from(schema.anamnesisSession).where(and(eq(schema.anamnesisSession.patientId, p.id)));
  return (
    <main className="mx-auto max-w-md p-6">
      <h1 className="mb-4 text-2xl font-semibold">Ihr Termin</h1>
      {s && <p className="mb-4 text-slate-600">Termin: {s.appointmentAt.toLocaleString("de-DE", { dateStyle: "long", timeStyle: "short" })}</p>}
      {ok && s?.status === "OPEN" ? (
        <div className="card mb-6"><p className="mb-3">Beschreiben Sie Ihre Beschwerden. Das dauert etwa 5 bis 10 Minuten.</p><Link className="btn w-full" href="/patient/dialog">Dialog starten</Link></div>
      ) : (
        <div className="card mb-6"><p>Ohne Ihre Einwilligung ist kein Dialog möglich. Ihre Daten wurden gelöscht.</p></div>
      )}
      <h2 className="mb-2 font-medium">Ihre Einwilligungen</h2>
      <ul className="mb-6 flex flex-col gap-2">
        {CONSENT_PURPOSES.map((c) => (
          <li key={c.id} className="card flex items-center justify-between gap-3">
            <span>{c.title}: <strong>{active.has(c.id) ? "erteilt" : "nicht erteilt"}</strong></span>
            {active.has(c.id) && (
              <form action={revokeAction}><input type="hidden" name="purpose" value={c.id} /><button className="btn-secondary">Widerrufen</button></form>
            )}
          </li>
        ))}
      </ul>
      <form action={logoutAction}><button className="btn-secondary w-full">Abmelden</button></form>
    </main>
  );
}
