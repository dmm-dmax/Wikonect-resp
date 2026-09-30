"use client";
import { useActionState } from "react";
import { loginAction } from "../actions";

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, undefined);
  return (
    <form action={action} className="flex flex-col gap-4">
      <div><label className="label" htmlFor="email">E-Mail</label><input className="input" id="email" name="email" type="email" autoComplete="email" required /></div>
      <div><label className="label" htmlFor="pw">Passwort</label><input className="input" id="pw" name="password" type="password" autoComplete="current-password" required /></div>
      {state?.error && <p role="alert" className="text-red-700">{state.error}</p>}
      <button className="btn" disabled={pending}>Anmelden</button>
    </form>
  );
}
