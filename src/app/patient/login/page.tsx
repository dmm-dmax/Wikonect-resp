import { LoginForm } from "./form";

export default function Page() {
  return (
    <main className="mx-auto max-w-md p-6">
      <h1 className="mb-6 text-2xl font-semibold">Anmelden</h1>
      <LoginForm />
      <p className="mt-6 text-sm text-slate-600">Neu hier? Nutzen Sie den Einladungslink Ihrer Praxis.</p>
    </main>
  );
}
