import { desc, eq } from "drizzle-orm";
import { requireDoctor } from "@/server/auth/guards";
import { db, schema } from "@/server/db";
import { InviteForm } from "./invite-form";
import { logoutAction } from "./actions";

export default async function Page() {
  const d = await requireDoctor();
  const sessions = await db()
    .select({ id: schema.anamnesisSession.id, status: schema.anamnesisSession.status, at: schema.anamnesisSession.appointmentAt, pseudonym: schema.patient.pseudonym })
    .from(schema.anamnesisSession)
    .innerJoin(schema.patient, eq(schema.patient.id, schema.anamnesisSession.patientId))
    .where(eq(schema.anamnesisSession.doctorId, d.id))
    .orderBy(desc(schema.anamnesisSession.appointmentAt));
  return (
    <main className="mx-auto max-w-5xl p-8">
      <header className="mb-8 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{d.displayName}</h1>
        <form action={logoutAction}><button className="btn-secondary">Abmelden</button></form>
      </header>
      <div className="grid gap-8 md:grid-cols-[2fr_1fr]">
        <section>
          <h2 className="mb-3 font-medium">Termine</h2>
          {sessions.length === 0 ? <p className="text-slate-600">Noch keine Patienten.</p> : (
            <table className="w-full text-left text-sm">
              <thead><tr className="border-b text-slate-600"><th className="py-2">Termin</th><th>Patient (Pseudonym)</th><th>Status</th></tr></thead>
              <tbody>{sessions.map((s) => (
                <tr key={s.id} className="border-b"><td className="py-2">{s.at.toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" })}</td><td>{s.pseudonym}</td><td>{s.status}</td></tr>
              ))}</tbody>
            </table>
          )}
        </section>
        <InviteForm />
      </div>
    </main>
  );
}
