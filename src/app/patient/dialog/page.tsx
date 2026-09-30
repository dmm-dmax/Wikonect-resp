import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { requirePatient } from "@/server/auth/guards";
import { hasRequiredConsents } from "@/server/consent";
import { db, schema } from "@/server/db";
import { getDialogView } from "@/server/dialog/service";
import { submitAction } from "../actions";
import { MessageForm } from "./form";

export default async function Page() {
  const p = await requirePatient();
  const [s] = await db().select().from(schema.anamnesisSession).where(eq(schema.anamnesisSession.patientId, p.id)).orderBy(desc(schema.anamnesisSession.createdAt)).limit(1);
  if (!s || !(await hasRequiredConsents(p.id))) {
    return (
      <main className="mx-auto max-w-md p-6">
        <p>Der Dialog ist nicht verfügbar.</p>
        <Link className="btn-secondary mt-4" href="/patient">Zurück</Link>
      </main>
    );
  }
  const v = await getDialogView(s.id, p.id);
  if (!v) return null;

  if (v.status === "ABORTED_EMERGENCY" && v.emergency) {
    return (
      <main className="mx-auto max-w-md p-6">
        <div role="alert" className="rounded-xl border-2 border-red-600 bg-red-50 p-5">
          <h1 className="mb-2 text-xl font-semibold text-red-900">{v.emergency.title}</h1>
          <p className="mb-4">{v.emergency.text}</p>
          <ul className="flex flex-col gap-2 font-medium">{v.emergency.lines.map((l) => <li key={l}>{l}</li>)}</ul>
        </div>
      </main>
    );
  }

  const done = v.status === "SUBMITTED";
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-4 p-6">
      <header>
        <div className="mb-1 flex justify-between text-sm text-slate-600"><span>Fortschritt</span><span>{v.progress} %</span></div>
        <div role="progressbar" aria-valuenow={v.progress} aria-valuemin={0} aria-valuemax={100} className="h-3 overflow-hidden rounded-full bg-slate-200">
          <div className="h-full bg-(--brand) transition-all" style={{ width: `${v.progress}%` }} />
        </div>
        <p className="mt-2 text-xs text-slate-500">KI ordnet Ihre Angaben. Sie stellt keine Diagnose. Bei akuten Beschwerden: Notruf 112.</p>
      </header>

      <ol className="flex flex-1 flex-col gap-3">
        {v.messages.map((m, i) => (
          <li key={i} className={m.role === "patient" ? "ml-8 rounded-2xl rounded-br-sm bg-(--brand) p-3 text-white" : "mr-8 rounded-2xl rounded-bl-sm border border-slate-200 bg-white p-3"}>
            {m.text}
          </li>
        ))}
      </ol>

      {done ? (
        <div className="card"><p className="font-medium">Ihre Angaben sind bei Ihrer Praxis.</p><p className="text-sm text-slate-600">Sie können dieses Fenster schließen.</p></div>
      ) : v.step === "review" ? (
        <section className="flex flex-col gap-3">
          {v.review.map((r) => (
            <div key={r.label} className="card">
              <h2 className="mb-1 font-medium">{r.label}</h2>
              <ul className="list-disc pl-5 text-sm text-slate-700">{r.quotes.map((q, i) => <li key={i}>{q}</li>)}</ul>
            </div>
          ))}
          <form action={submitAction}><input type="hidden" name="sessionId" value={s.id} /><button className="btn w-full">An Praxis senden</button></form>
        </section>
      ) : (
        <MessageForm sessionId={s.id} />
      )}
    </main>
  );
}
