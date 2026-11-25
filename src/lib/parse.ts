// Turns submitted form data into checked values. Everything from the browser is
// untrusted, so each field is validated here, on the server.
import { z } from "zod";
import { entities, type EntityName, type Field } from "./entities.ts";

export type Values = Record<string, string | number | boolean | number[] | null>;
export type Errors = Record<string, string>;

const isRealDate = (value: string) => {
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
};
const day = z.coerce.number().int().min(0).max(6);
const wholeNumber = z.string().regex(/^\d{1,9}$/).transform(Number);

function schemaFor(field: Field): z.ZodType {
  switch (field.type) {
    case "text": {
      const max = field.max ?? 200;
      return z.string().max(max, `Use ${max} characters or fewer.`);
    }
    case "number":
      return wholeNumber.pipe(
        z.number().min(field.min, `Use ${field.min} or more.`).max(field.max, `Use ${field.max} or less.`),
      );
    case "date":
      return z.string().regex(/^20\d\d-\d\d-\d\d$/, "Choose a date.").refine(isRealDate, "That date does not exist.");
    case "time":
      return z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Choose a time.");
    case "weekday":
      return z.string().regex(/^[0-6]$/).transform(Number);
    case "ref":
      return wholeNumber;
    case "choice":
      return z.enum(field.options.map((o) => o.value) as [string, ...string[]]);
    case "checkbox":
    case "weekdays":
      throw new Error("Handled separately");
  }
}

// Rules that involve two fields. The database enforces them too.
const crossChecks: Partial<Record<EntityName, (v: Values) => Errors>> = {
  shifts: (v): Errors => (String(v.endTime) > String(v.startTime) ? {} : { endTime: "The end must be after the start." }),
  "staffing-rules": (v): Errors =>
    (v.weekday === null) !== (v.date === null) ? {} : { weekday: "Choose either a weekday or a date." },
  "time-off": (v): Errors => {
    if (String(v.endDate) < String(v.startDate)) return { endDate: "This cannot be before the start date." };
    if (v.kind === "comp_off" && v.startDate !== v.endDate) return { endDate: "A comp-off is a single day." };
    return {};
  },
};

export function parseForm(entity: EntityName, form: FormData): { values: Values; errors: Errors } {
  const values: Values = {};
  const errors: Errors = {};

  for (const field of entities[entity].fields as Field[]) {
    if (field.type === "checkbox") {
      values[field.name] = form.get(field.name) !== null;
    } else if (field.type === "weekdays") {
      const parsed = z.array(day).safeParse(form.getAll(field.name));
      if (!parsed.success) errors[field.name] = "Choose days from the list.";
      else {
        values[field.name] = [...new Set(parsed.data)].sort();
        if (field.required && parsed.data.length === 0) errors[field.name] = "Choose at least one day.";
      }
    } else {
      const raw = String(form.get(field.name) ?? "").trim();
      if (raw === "") {
        values[field.name] = null;
        if (field.required) errors[field.name] = "This is needed.";
        continue;
      }
      const parsed = schemaFor(field).safeParse(raw);
      if (parsed.success) values[field.name] = parsed.data as string | number;
      else errors[field.name] = parsed.error.issues[0].message;
    }
  }

  if (Object.keys(errors).length === 0) Object.assign(errors, crossChecks[entity]?.(values));
  return { values, errors };
}
