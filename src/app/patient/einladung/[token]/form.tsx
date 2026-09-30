"use client";
import { useActionState } from "react";
import { registerAction } from "../../actions";

type Purpose = { id: string; required: boolean; title: string; text: string };

export function RegisterForm({ token, purposes, info }: { token: string; purposes: Purpose[]; info: string }) {
  const [state, action, pending] = useActionState(registerAction, undefined);
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />
      <div><label className="label" htmlFor="email">E-Mail</label><input className="input" id="email" name="email" type="email" autoComplete="email" required /></div>
      <div><label className="label" htmlFor="pw">Passwort (mind. 10 Zeichen)</label><input className="input" id="pw" name="password" type="password" minLength={10} autoComplete="new-password" required /></div>
      <fieldset className="card flex flex-col gap-4">
        <legend className="px-1 font-medium">Einwilligung</legend>
        {purposes.map((p) => (
          <label key={p.id} className="flex items-start gap-3">
            <input type="checkbox" name="consent" value={p.id} required={p.required} className="mt-1 h-5 w-5" />
            <span><strong>{p.title}{p.required ? "" : " (freiwillig)"}</strong><br /><span className="text-sm text-slate-600">{p.text}</span></span>
          </label>
        ))}
        <p className="text-sm text-slate-600">{info}</p>
      </fieldset>
      {state?.error && <p role="alert" className="text-red-700">{state.error}</p>}
      <button className="btn" disabled={pending}>Konto anlegen</button>
    </form>
  );
}
