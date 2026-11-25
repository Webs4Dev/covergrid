"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { FormState } from "@/app/actions";
import { WEEKDAYS, type Field, type Option, type RefName } from "@/lib/entities";

type Props = {
  fields: Field[];
  options: Partial<Record<RefName, Option[]>>;
  initial: Record<string, string[]> | null;
  action: (state: FormState, form: FormData) => Promise<FormState>;
  submitLabel: string;
  cancelHref: string | null;
};

const defaults = (field: Field): string[] => {
  if (field.type === "checkbox") return field.initial ? ["on"] : [];
  if (field.type === "number" && field.initial !== undefined) return [String(field.initial)];
  return [];
};

export function EntityForm({ fields, options, initial, action, submitLabel, cancelHref }: Props) {
  const [state, formAction, pending] = useActionState(action, {});

  return (
    // The key makes React redraw the inputs with what was typed after an error.
    <form action={formAction} key={JSON.stringify(state)} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" noValidate>
      {fields.map((field) => {
        const current = state.values ? (state.values[field.name] ?? []) : (initial?.[field.name] ?? defaults(field));
        const error = state.errors?.[field.name];
        const id = `field-${field.name}`;
        const described = [error && `${id}-error`, field.help && `${id}-help`].filter(Boolean).join(" ") || undefined;
        const common = { id, name: field.name, "aria-invalid": error ? true : undefined, "aria-describedby": described };
        const select = (list: Option[], empty: string) => (
          <select {...common} defaultValue={current[0] ?? ""} className="control">
            <option value="">{empty}</option>
            {list.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        );

        return (
          <div key={field.name} className="min-w-0">
            {field.type === "weekdays" ? (
              <fieldset aria-describedby={described}>
                <legend className="mb-1 text-sm font-medium">{field.label}</legend>
                <div className="flex flex-wrap gap-x-2 gap-y-1">
                  {WEEKDAYS.map((day, i) => (
                    <label key={day} className="flex items-center gap-1 py-1 text-sm">
                      <input type="checkbox" name={field.name} value={i} defaultChecked={current.includes(String(i))} className="accent-accent" />
                      {day}
                    </label>
                  ))}
                </div>
              </fieldset>
            ) : field.type === "checkbox" ? (
              <label className="flex items-center gap-2 text-sm font-medium sm:pt-6">
                <input {...common} type="checkbox" defaultChecked={current.length > 0} className="accent-accent" />
                {field.label}
              </label>
            ) : (
              <>
                <label htmlFor={id} className="mb-1 block text-sm font-medium">
                  {field.label}
                  {!field.required && <span className="font-normal text-muted"> (optional)</span>}
                </label>
                {field.type === "ref" ? (
                  select(options[field.ref] ?? [], field.emptyLabel ?? "Choose one")
                ) : field.type === "choice" ? (
                  select(field.options, "Choose one")
                ) : field.type === "weekday" ? (
                  select(WEEKDAYS.map((label, i) => ({ value: String(i), label })), "No weekday")
                ) : (
                  <input
                    {...common}
                    type={field.type}
                    defaultValue={current[0] ?? ""}
                    maxLength={field.type === "text" ? field.max : undefined}
                    min={field.type === "number" ? field.min : undefined}
                    max={field.type === "number" ? field.max : undefined}
                    className="control"
                  />
                )}
              </>
            )}
            {field.help && <p id={`${id}-help`} className="mt-1 text-xs text-muted">{field.help}</p>}
            {error && <p id={`${id}-error`} className="mt-1 text-xs font-medium text-danger">{error}</p>}
          </div>
        );
      })}
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2 lg:col-span-3">
        <button type="submit" disabled={pending} className="btn btn-primary">
          {pending ? "Saving..." : submitLabel}
        </button>
        {cancelHref && <Link href={cancelHref} className="btn">Cancel</Link>}
        {state.message && <p role="alert" className="text-sm font-medium text-danger">{state.message}</p>}
      </div>
    </form>
  );
}
