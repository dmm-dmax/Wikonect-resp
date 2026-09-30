"use client";
import { useActionState } from "react";
import { inviteAction } from "./actions";

export function InviteForm() {
  const [state, action, pending] = useActionState(inviteAction, undefined);
  return (
    <form action={action} className="card flex flex-col gap-3">
      <h2 className="font-medium">Patient einladen</h2>
      <div><label className="label" htmlFor="at">Termin</label><input className="input" id="at" name="appointmentAt" type="datetime-local" required /></div>
      <button className="btn" disabled={pending}>Einladungslink erzeugen</button>
      {state?.error && <p role="alert" className="text-red-700">{state.error}</p>}
      {state?.link && (
        <div className="rounded-lg bg-emerald-50 p-3 text-sm">
          <p className="mb-1 font-medium">Link (wird nur jetzt angezeigt, einmal nutzbar):</p>
          <code className="break-all">{state.link}</code>
        </div>
      )}
    </form>
  );
}
