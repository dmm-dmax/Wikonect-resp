"use client";
import { useActionState, useEffect, useRef } from "react";
import { sendAction } from "../actions";

export function MessageForm({ sessionId }: { sessionId: string }) {
  const [state, action, pending] = useActionState(sendAction, undefined);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (!pending) ref.current?.focus();
  }, [pending]);
  return (
    <form action={action} className="sticky bottom-0 -mx-6 flex flex-col gap-2 border-t border-slate-200 bg-slate-50 p-4">
      <input type="hidden" name="sessionId" value={sessionId} />
      <label className="label" htmlFor="text">Ihre Antwort</label>
      <textarea ref={ref} id="text" name="text" rows={3} maxLength={2000} required className="input" placeholder="Schreiben Sie in Ihren Worten …" />
      {state?.error && <p role="alert" className="text-red-700">{state.error}</p>}
      <button className="btn" disabled={pending}>{pending ? "Wird gesendet …" : "Senden"}</button>
    </form>
  );
}
