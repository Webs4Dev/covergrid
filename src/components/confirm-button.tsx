"use client";

import { useActionState, useState } from "react";
import type { FormState } from "@/app/actions";

type Props = { label: string; confirmLabel: string; note: string; action: () => Promise<FormState> };

/** A destructive action that needs a second click. */
export function ConfirmButton({ label, confirmLabel, note, action }: Props) {
  const [asking, setAsking] = useState(false);
  const [state, formAction, pending] = useActionState<FormState>(() => action(), {});

  if (!asking) {
    return (
      <button type="button" className="btn text-danger" onClick={() => setAsking(true)}>
        {label}
      </button>
    );
  }
  return (
    <form action={formAction} className="w-64 text-left whitespace-normal">
      <p className="mb-2 text-xs text-muted">{note}</p>
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className="btn btn-danger">
          {pending ? "Working..." : confirmLabel}
        </button>
        <button type="button" className="btn" onClick={() => setAsking(false)}>Keep</button>
      </div>
      {state.message && <p role="alert" className="mt-2 text-xs font-medium text-danger">{state.message}</p>}
    </form>
  );
}
