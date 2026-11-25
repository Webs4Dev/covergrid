// Reading and writing the data types described in lib/entities.ts. Server only.
import { and, eq, sql, type SQL } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import { entities, type EntityName, type Field, type Option, type RefName } from "@/lib/entities";
import type { Errors, Values } from "@/lib/parse";
import { getDb } from "./index";
import * as t from "./schema";

const tables: Record<EntityName, { table: PgTable; key: string[] }> = {
  employees: { table: t.employees, key: ["id"] },
  pods: { table: t.pods, key: ["id"] },
  brands: { table: t.brands, key: ["id"] },
  services: { table: t.services, key: ["id"] },
  assignments: { table: t.assignments, key: ["employeeId", "serviceId"] },
  processes: { table: t.processes, key: ["id"] },
  calendars: { table: t.operatingCalendars, key: ["id"] },
  shifts: { table: t.shifts, key: ["id"] },
  "staffing-rules": { table: t.staffingRules, key: ["id"] },
  holidays: { table: t.holidays, key: ["date"] },
  "time-off": { table: t.timeOff, key: ["id"] },
  "comp-offs": { table: t.compOffCredits, key: ["id"] },
};

export type Row = { key: string; values: Record<string, unknown> };

const column = (table: PgTable, name: string) => (table as unknown as Record<string, PgColumn>)[name];

export async function listRows(entity: EntityName): Promise<Row[]> {
  const { table, key } = tables[entity];
  const rows = (await getDb().select().from(table)) as Record<string, unknown>[];
  return rows.map((values) => ({ key: key.map((k) => String(values[k])).join("_"), values }));
}

/** The condition that picks one row, or null if the key is not well formed. */
function where(entity: EntityName, rowKey: string): SQL | null {
  const { table, key } = tables[entity];
  const parts = rowKey.split("_");
  const valid = entity === "holidays" ? /^\d{4}-\d\d-\d\d$/ : /^\d{1,9}$/;
  if (parts.length !== key.length || !parts.every((p) => valid.test(p))) return null;
  return and(...key.map((k, i) => eq(column(table, k), entity === "holidays" ? parts[i] : Number(parts[i])))) ?? null;
}

export async function loadOptions(entity: EntityName): Promise<Partial<Record<RefName, Option[]>>> {
  const needed = new Set((entities[entity].fields as Field[]).flatMap((f) => (f.type === "ref" ? [f.ref] : [])));
  const queries: Record<RefName, SQL> = {
    pods: sql`select id, name as label from pods order by name`,
    employees: sql`select id, name || case when is_active then '' else ' (off)' end as label from employees order by name`,
    brands: sql`select id, name as label from brands order by name`,
    processes: sql`select id, name as label from processes order by name`,
    calendars: sql`select id, name as label from operating_calendars order by name`,
    shifts: sql`select id, name || ' (' || to_char(start_time, 'HH24:MI') || '-' || to_char(end_time, 'HH24:MI') || ')' as label from shifts order by start_time`,
    services: sql`select s.id, b.name || ' - ' || p.code as label from services s
      join brands b on b.id = s.brand_id join processes p on p.id = s.process_id order by 2`,
  };
  const result: Partial<Record<RefName, Option[]>> = {};
  await Promise.all(
    [...needed].map(async (ref) => {
      const { rows } = await getDb().execute(queries[ref]);
      result[ref] = rows.map((r) => ({ value: String(r.id), label: String(r.label) }));
    }),
  );
  return result;
}

// Checks that need to look at other rows.
async function relatedErrors(entity: EntityName, values: Values, rowKey: string | null): Promise<Errors> {
  const db = getDb();
  if (entity === "pods" && values.leadId !== null) {
    const [lead] = await db.select().from(t.employees).where(eq(t.employees.id, values.leadId as number));
    if (!rowKey || lead?.podId !== Number(rowKey)) {
      return { leadId: "The lead must already be a member of this pod." };
    }
  }
  if (entity === "employees" && rowKey) {
    const led = await db.select().from(t.pods).where(eq(t.pods.leadId, Number(rowKey)));
    if (led.some((pod) => pod.id !== values.podId)) {
      return { podId: `This person leads ${led[0].name}. Choose another lead for that pod first.` };
    }
  }
  return {};
}

export type SaveResult = { ok: true } | { ok: false; message: string; errors?: Errors };

export async function saveRow(entity: EntityName, rowKey: string | null, values: Values): Promise<SaveResult> {
  const errors = await relatedErrors(entity, values, rowKey);
  if (Object.keys(errors).length > 0) return { ok: false, message: "Please fix the marked field.", errors };
  const { table } = tables[entity];
  try {
    if (rowKey === null) {
      await getDb().insert(table).values(values);
    } else {
      const condition = where(entity, rowKey);
      if (!condition) return { ok: false, message: "That entry could not be found." };
      const done = await getDb().update(table).set(values).where(condition).returning();
      if (done.length === 0) return { ok: false, message: "That entry no longer exists. Reload the page." };
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, message: describe(error, entity, "save") };
  }
}

export async function deleteRow(entity: EntityName, rowKey: string): Promise<SaveResult> {
  const condition = where(entity, rowKey);
  if (!condition) return { ok: false, message: "That entry could not be found." };
  try {
    await getDb().delete(tables[entity].table).where(condition);
    return { ok: true };
  } catch (error) {
    return { ok: false, message: describe(error, entity, "delete") };
  }
}

// Database errors become fixed sentences; raw text is never sent to the browser.
function describe(error: unknown, entity: EntityName, action: "save" | "delete") {
  let current = error as { code?: unknown; cause?: unknown } | undefined;
  for (let depth = 0; current && depth < 5; depth++) {
    if (current.code === "23505") return `That ${entities[entity].one} already exists.`;
    if (current.code === "23503") {
      return action === "delete"
        ? "It is still in use, so it cannot be deleted. Remove what uses it, or switch it off."
        : "Something you chose no longer exists. Reload the page.";
    }
    if (current.code === "23514") return "The database rejected these values. Check the numbers and dates.";
    current = current.cause as typeof current;
  }
  console.error(`Could not ${action} ${entity}.`);
  return `Could not ${action}. Try again.`;
}
