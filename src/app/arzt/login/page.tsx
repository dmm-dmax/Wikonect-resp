"use client";
import { useActionState } from "react";
import { loginAction } from "../actions";

export default function Page() {
  const [state, action, pending] = useActionState(loginAction, undefined);
  return (
    <main className="mx-auto max-w-md p-6">
      <h1 className="mb-6 text-2xl font-semibold">Arzt-Anmeldung</h1>
      <form action={action} className="flex flex-col gap-4">
        <div><label className="label" htmlFor="email">E-Mail</label><input className="input" id="email" name="email" type="email" autoComplete="username" required /></div>
        <div><label className="label" htmlFor="pw">Passwort</label><input className="input" id="pw" name="password" type="password" autoComplete="current-password" required /></div>
        <div><label className="label" htmlFor="totp">Code aus Authenticator-App</label><input className="input" id="totp" name="totp" inputMode="numeric" pattern="\d{6}" maxLength={6} autoComplete="one-time-code" required /></div>
        {state?.error && <p role="alert" className="text-red-700">{state.error}</p>}
        <button className="btn" disabled={pending}>Anmelden</button>
      </form>
    </main>
  );
}
