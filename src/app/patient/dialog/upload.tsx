"use client";
import { useActionState } from "react";
import { deleteDocumentAction, uploadAction } from "../actions";

type Doc = { id: string; filename: string; kind: string; note: string | null; labValues: number };

export function UploadCard({ sessionId, complaints, docs }: { sessionId: string; complaints: { id: string; label: string }[]; docs: Doc[] }) {
  const [state, action, pending] = useActionState(uploadAction, undefined);
  return (
    <section className="card flex flex-col gap-3" aria-labelledby="upl">
      <h2 id="upl" className="font-medium">Befunde hochladen (freiwillig)</h2>
      <p className="text-sm text-slate-600">PDF, JPG oder PNG, bis 10 MB. Laborwerte aus PDFs werden übernommen, nicht bewertet. Röntgenbilder gehen nur als Anhang an Ihre Praxis.</p>
      {docs.length > 0 && (
        <ul className="flex flex-col gap-2 text-sm">
          {docs.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 p-2">
              <span>
                {d.filename}
                {d.labValues > 0 && <span className="text-slate-600"> · {d.labValues} Werte übernommen</span>}
                {d.note === "no_text_layer" && <span className="text-slate-600"> · nur als Anhang (kein Text erkennbar)</span>}
              </span>
              <form action={deleteDocumentAction}><input type="hidden" name="documentId" value={d.id} /><button className="btn-secondary min-h-9 px-3 py-1 text-sm">Löschen</button></form>
            </li>
          ))}
        </ul>
      )}
      <form action={action} className="flex flex-col gap-3">
        <input type="hidden" name="sessionId" value={sessionId} />
        <input className="input" type="file" name="file" accept="application/pdf,image/jpeg,image/png" required aria-label="Datei" />
        {complaints.length > 0 && (
          <div>
            <label className="label" htmlFor="cid">Gehört zu (optional)</label>
            <select id="cid" name="complaintId" className="input" defaultValue="">
              <option value="">Keine Angabe</option>
              {complaints.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </div>
        )}
        {state?.error && <p role="alert" className="text-red-700">{state.error}</p>}
        <button className="btn-secondary" disabled={pending}>{pending ? "Wird hochgeladen …" : "Hochladen"}</button>
      </form>
    </section>
  );
}
