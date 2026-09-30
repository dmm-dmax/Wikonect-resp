import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto max-w-md p-6">
      <h1 className="mb-2 text-2xl font-semibold">Anamnese-Vorbereitung</h1>
      <p className="mb-6 text-slate-600">Entwicklungsstand. Nur synthetische Daten.</p>
      <div className="flex flex-col gap-3">
        <Link className="btn" href="/patient/login">Patientenbereich</Link>
        <Link className="btn-secondary" href="/arzt/login">Arztbereich</Link>
      </div>
    </main>
  );
}
