"use client";

import { useActionState } from "react";
import type { FormState } from "@/app/actions";

type Props = { action: (state: FormState, form: FormData) => Promise<FormState>; mustFix: number };

export function PublishForm({ action, mustFix }: Props) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} key={JSON.stringify(state)} className="panel p-4">
      <h2 className="font-semibold">Publish this roster</h2>
      {mustFix > 0 ? (
        <>
          <p className="mt-1 text-sm text-muted">
            {mustFix} must-fix {mustFix === 1 ? "problem is" : "problems are"} open. To publish anyway, say why. The reason is kept with the roster.
          </p>
          <label htmlFor="reason" className="mt-3 mb-1 block text-sm font-medium">Reason</label>
          <textarea id="reason" name="reason" rows={2} maxLength={300} defaultValue={state.values?.reason?.[0] ?? ""} className="control max-w-xl" />
        </>
      ) : (
        <p className="mt-1 text-sm text-muted">No must-fix problems. Anyone who works a public holiday earns a comp-off.</p>
      )}
      <div className="mt-3">
        <button type="submit" disabled={pending} className="btn btn-primary">
          {pending ? "Publishing..." : mustFix > 0 ? "Publish with reason" : "Publish roster"}
        </button>
      </div>
      {state.message && <p role="alert" className="mt-2 text-sm font-medium text-danger">{state.message}</p>}
    </form>
  );
}
