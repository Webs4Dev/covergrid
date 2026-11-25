"use client";

import { useActionState } from "react";
import type { FormState } from "@/app/actions";

export function GenerateButton({ action, label }: { action: () => Promise<FormState>; label: string }) {
  const [state, formAction, pending] = useActionState<FormState>(() => action(), {});
  return (
    <form action={formAction}>
      <button type="submit" disabled={pending} className="btn btn-primary">{pending ? "Generating..." : label}</button>
      {state.message && <p role="alert" className="mt-2 text-sm font-medium text-danger">{state.message}</p>}
    </form>
  );
}
