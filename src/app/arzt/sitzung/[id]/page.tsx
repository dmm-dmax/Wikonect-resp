import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { requireDoctor } from "@/server/auth/guards";
import { db, schema } from "@/server/db";
import { getSummaryForDoctor } from "@/server/summary";
import type { SourceRef, SummaryDoc, SummaryLab, SummarySection } from "@/server/summary/build";
import { Controls } from "./controls";

const REGION: Record<string, string> = {
  kopf: "Kopf", hals: "Hals", thorax: "Thorax", abdomen: "Abdomen", ruecken: "Rücken", extremitaeten: "Extremitäten",
  haut: "Haut", psyche: "Psyche", allgemein: "Allgemein", sonstige: "Sonstige",
};

const fmt = (iso: string) => new Date(iso).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" });

function Source({ s }: { s: SourceRef }) {
  if (s.kind === "DIALOG") return <span className="rounded bg-sky-100 px-2 py-0.5 text-xs text-sky-900">Dialog</span>;
  return <span className="rounded bg-violet-100 px-2 py-0.5 text-xs text-violet-900">Befund: {s.filename}{s.page ? `, S. ${s.page}` : ""}</span>;
}

function Labs({ labs }: { labs: SummaryLab[] }) {
  if (!labs.length) return null;
  return (
    <div className="mt-4">
      <h4 className="mb-1 text-sm font-medium">Laborwerte (aus Dokument übernommen, nicht bewertet)</h4>
      <table className="w-full text-left text-sm">
        <thead><tr className="border-b text-slate-600"><th className="py-1">Parameter</th><th>Wert</th><th>Einheit</th><th>Referenz lt. Dokument</th><th>Quelle</th><th>Zuordnung</th></tr></thead>
        <tbody>
          {labs.map((l, i) => (
            <tr key={i} className="border-b align-top">
              <td className="py-1">{l.nameAsPrinted}{l.canonicalName && l.canonicalName !== l.nameAsPrinted ? <span className="text-slate-500"> ({l.canonicalName})</span> : null}</td>
              <td className="font-medium">{l.value}</td><td>{l.unit ?? ""}</td><td>{l.refRangeAsPrinted ?? ""}</td>
              <td><Source s={l.source} /></td>
              <td className="text-xs text-slate-600">{l.assignedBy === "PATIENT" ? "durch Patient" : l.assignedBy === "RULE" ? `Organsystem (${l.mappingRuleId ?? "Regel"})` : "–"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Attachments({ ids, docs }: { ids: string[]; docs: SummaryDoc[] }) {
  const list = docs.filter((d) => ids.includes(d.id));
  if (!list.length) return null;
  return (
    <div className="mt-4">
      <h4 className="mb-1 text-sm font-medium">Anhänge</h4>
      <ul className="flex flex-wrap gap-3">
        {list.map((d) => (
          <li key={d.id} className="rounded-lg border border-slate-200 p-2 text-sm">
            <a className="text-sky-800 underline" href={`/arzt/api/dokument/${d.id}`} target="_blank" rel="noreferrer">{d.filename}</a>
            <span className="text-slate-500"> · {d.kind === "PDF" ? "PDF" : "Bild (keine Auswertung)"}</span>
            {d.kind === "IMAGE" && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/arzt/api/dokument/${d.id}`} alt={d.filename} className="mt-2 max-h-40 rounded border" />
            )}
            {d.note === "no_text_layer" && <p className="text-xs text-slate-500">Scan ohne Textlayer, nur Anhang.</p>}
            {d.text && (
              <details className="mt-2"><summary className="cursor-pointer text-xs text-slate-600">Originaltext aus Dokument</summary>
                <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap rounded bg-slate-50 p-2 text-xs">{d.text}</pre></details>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Section({ s, docs }: { s: SummarySection; docs: SummaryDoc[] }) {
  return (
    <details open data-section className="card print:break-inside-avoid">
      <summary className="cursor-pointer">
        <span className="text-lg font-semibold">{s.title}</span>
        {s.region && <span className="ml-2 rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700">{REGION[s.region] ?? s.region}</span>}
        {s.patientLabel && s.patientLabel !== s.title && <span className="ml-2 text-sm text-slate-500">Patient: „{s.patientLabel}“</span>}
        <p className="mt-1 text-sm font-normal text-slate-700">{s.headline}</p>
      </summary>
      {s.items.length > 0 && (
        <table className="mt-3 w-full text-left text-sm">
          <thead><tr className="border-b text-slate-600"><th className="w-40 py-1">Feld</th><th>Fachsprache</th><th>Originalaussage Patient</th><th className="w-44">Quelle</th></tr></thead>
          <tbody>
            {s.items.map((i, k) => (
              <tr key={k} className="border-b align-top">
                <td className="py-1.5 text-slate-600">{i.fieldLabel}</td>
                <td className="font-medium">
                  {i.clinicalTerm ?? <span className="font-normal text-amber-800">{i.translationBlocked ? "Übersetzung vom Filter blockiert" : "wörtlich übernommen"}</span>}
                </td>
                <td className="italic text-slate-700">„{i.patientQuote}“</td>
                <td><Source s={i.source} />{i.promptVersion && <div className="mt-1 text-[11px] text-slate-400">{i.promptVersion} · {i.model}</div>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <Labs labs={s.labs} />
      <Attachments ids={s.attachments} docs={docs} />
    </details>
  );
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const d = await requireDoctor();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [s] = await db().select().from(schema.anamnesisSession).where(and(eq(schema.anamnesisSession.id, id), eq(schema.anamnesisSession.doctorId, d.id))).limit(1);
  if (!s) notFound();

  if (s.status === "ABORTED_EMERGENCY") {
    return (
      <main className="mx-auto max-w-3xl p-8">
        <Link href="/arzt" className="text-sm text-sky-800 underline print:hidden">← Übersicht</Link>
        <div role="alert" className="mt-4 rounded-xl border-2 border-red-600 bg-red-50 p-5">
          <h1 className="text-lg font-semibold">Dialog aus Sicherheitsgründen abgebrochen</h1>
          <p>Der Patient hat Begriffe genannt, bei denen der Dialog regelbasiert beendet wurde. Es liegen keine Angaben vor. Bitte Patient direkt kontaktieren. Die App bewertet den Fall nicht.</p>
        </div>
      </main>
    );
  }
  const m = await getSummaryForDoctor(id, d.id);
  if (!m) {
    return (
      <main className="mx-auto max-w-3xl p-8">
        <Link href="/arzt" className="text-sm text-sky-800 underline">← Übersicht</Link>
        <p className="mt-4">Für diesen Termin liegt noch keine Zusammenfassung vor.</p>
      </main>
    );
  }
  return (
    <main className="mx-auto max-w-6xl p-8 print:p-0">
      <Link href="/arzt" className="text-sm text-sky-800 underline print:hidden">← Übersicht</Link>
      <header className="mb-4 mt-2 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Anamnese-Vorbereitung · {m.pseudonym}</h1>
          <p className="text-sm text-slate-600">Termin {fmt(m.appointmentAt)} · abgesendet {fmt(m.submittedAt)} · {m.version}</p>
        </div>
        <Controls />
      </header>
      <p className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
        Strukturierte Wiedergabe der Patientenangaben und Befunddaten. Keine Diagnose, keine Bewertung, keine Empfehlung. Die ärztliche Anamnese und Beurteilung ersetzt sie nicht. Fachübersetzungen sind maschinell erzeugt und an der Originalaussage zu prüfen.
      </p>
      <div className="flex flex-col gap-4">
        {m.patientFreeText.length > 0 && (
          <details data-section className="card">
            <summary className="cursor-pointer font-semibold">Erstbeschreibung im Wortlaut</summary>
            {m.patientFreeText.map((t, i) => <p key={i} className="mt-2 whitespace-pre-wrap italic text-slate-700">„{t}“</p>)}
          </details>
        )}
        {m.sections.map((sec) => <Section key={sec.id} s={sec} docs={m.documents} />)}
      </div>
    </main>
  );
}
