"use client";

import { useActionState } from "react";
import type { FormState } from "@/app/actions";

type Props = {
  action: (state: FormState, form: FormData) => Promise<FormState>;
  submitLabel: string;
  danger?: boolean;
  children?: React.ReactNode;
};

/** A form around server-rendered choices, with one button and an error line. */
export function ChangeForm({ action, submitLabel, danger, children }: Props) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className="space-y-4">
      {children}
      <button type="submit" disabled={pending} className={`btn ${danger ? "btn-danger" : "btn-primary"}`}>
        {pending ? "Saving..." : submitLabel}
      </button>
      {state.message && <p role="alert" className="text-sm font-medium text-danger">{state.message}</p>}
    </form>
  );
}
