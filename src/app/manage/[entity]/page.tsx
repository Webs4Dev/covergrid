import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { remove, save } from "@/app/actions";
import { ConfirmButton } from "@/components/confirm-button";
import { EntityForm } from "@/components/entity-form";
import { listRows, loadOptions, type Row } from "@/db/admin";
import { entities, isEntityName, WEEKDAYS, type Field, type Option, type RefName } from "@/lib/entities";

const DONE: Record<string, string> = { added: "Added.", saved: "Changes saved.", deleted: "Deleted." };
const dateFormat = new Intl.DateTimeFormat("en-GB", {
  weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
});

function show(field: Field, value: unknown, options: Partial<Record<RefName, Option[]>>): string {
  if (field.type === "checkbox") return value ? "Yes" : "No";
  if (field.type === "weekdays") return (value as number[]).map((d) => WEEKDAYS[d]).join(", ") || "-";
  if (value === null || value === undefined || value === "") {
    return field.type === "ref" ? (field.emptyLabel ?? "-") : "-";
  }
  if (field.type === "weekday") return WEEKDAYS[Number(value)];
  if (field.type === "ref") return options[field.ref]?.find((o) => o.value === String(value))?.label ?? "Unknown";
  if (field.type === "choice") return field.options.find((o) => o.value === value)?.label ?? String(value);
  if (field.type === "date") return dateFormat.format(new Date(`${value}T00:00:00Z`));
  if (field.type === "time") return String(value).slice(0, 5);
  return String(value);
}

/** A stored row as the strings a form expects. */
function toForm(fields: Field[], row: Row) {
  return Object.fromEntries(
    fields.map((f) => {
      const value = row.values[f.name];
      if (f.type === "checkbox") return [f.name, value ? ["on"] : []];
      if (f.type === "weekdays") return [f.name, (value as number[]).map(String)];
      if (value === null || value === undefined) return [f.name, []];
      return [f.name, [f.type === "time" ? String(value).slice(0, 5) : String(value)]];
    }),
  );
}

export default async function ManagePage({ params, searchParams }: PageProps<"/manage/[entity]">) {
  await connection();
  const { entity } = await params;
  if (!isEntityName(entity)) notFound();
  const query = await searchParams;
  const search = typeof query.q === "string" ? query.q.slice(0, 80) : "";
  const editKey = typeof query.edit === "string" ? query.edit : null;

  const definition = entities[entity];
  const fields = definition.fields as Field[];
  const [rows, options] = await Promise.all([listRows(entity), loadOptions(entity)]);
  const editing = rows.find((r) => r.key === editKey) ?? null;
  const columns = fields.filter((f) => !f.hideInList);

  const table = rows
    .map((row) => ({ row, cells: columns.map((f) => show(f, row.values[f.name], options)) }))
    .filter(({ cells }) => cells.join(" ").toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) =>
      columns[0].type === "date"
        ? String(a.row.values[columns[0].name]).localeCompare(String(b.row.values[columns[0].name]))
        : a.cells.join(" ").localeCompare(b.cells.join(" ")),
    );

  const base = `/manage/${entity}`;
  const done = typeof query.done === "string" ? DONE[query.done] : undefined;

  return (
    <div className="flex flex-col p-4 lg:h-full lg:min-h-0">
      <h1 className="text-xl font-bold">{definition.title}</h1>
      <p className="mt-1 text-sm text-muted">{definition.about}</p>
      {done && !editing && (
        <p role="status" className="mt-4 rounded-md bg-accent-soft px-3 py-2 text-sm">{done}</p>
      )}

      <details className="panel mt-3 shrink-0 p-3" open={editing !== null} key={editing?.key ?? "new"}>
        <summary className="cursor-pointer font-semibold">
          {editing ? `Edit ${definition.one}` : `Add ${definition.one}`}
        </summary>
        <div className="mt-4">
          <EntityForm
            fields={fields}
            options={options}
            initial={editing ? toForm(fields, editing) : null}
            action={save.bind(null, entity, editing?.key ?? null)}
            submitLabel={editing ? "Save changes" : `Add ${definition.one}`}
            cancelHref={editing ? base : null}
          />
        </div>
      </details>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <form action={base} className="flex gap-2">
          <input type="search" name="q" defaultValue={search} placeholder="Search" aria-label={`Search ${definition.title}`} className="control" />
          <button className="btn">Search</button>
        </form>
        <p className="text-sm text-muted">
          {search ? `${table.length} of ${rows.length} shown` : `${rows.length} in total`}
        </p>
      </div>

      <div className="panel relative mt-3 overflow-auto lg:min-h-64 lg:flex-1">
        <table className="w-full text-left text-sm tabular-nums">
          <thead>
            <tr className="border-b border-line text-muted">
              {columns.map((f) => (
                <th key={f.name} scope="col" className="sticky top-0 z-10 bg-surface px-3 py-2 font-medium whitespace-nowrap shadow-[inset_0_-1px_0_var(--color-line)]">{f.label}</th>
              ))}
              <th scope="col" className="sticky top-0 z-10 bg-surface px-3 py-2 shadow-[inset_0_-1px_0_var(--color-line)]"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {table.map(({ row, cells }) => (
              <tr key={row.key} className="border-b border-line last:border-0 hover:bg-paper">
                {cells.map((cell, i) => (
                  <td key={columns[i].name} className="max-w-64 truncate px-3 py-2" title={cell}>
                    {columns[i].name === "reason" && cell !== "-" ? <span className="font-semibold">{cell}</span> : cell}
                  </td>
                ))}
                <td className="px-3 py-1.5">
                  <div className="flex items-start justify-end gap-2">
                    {entity === "time-off" && ["requested", "approved"].includes(String(row.values.status)) && (
                      <Link href={`/roster/leave?id=${row.key}`} className="btn btn-primary">{row.values.status === "requested" ? "Review" : "Cancel"}</Link>
                    )}
                    <Link href={`${base}?edit=${row.key}`} className="btn">Edit</Link>
                    <ConfirmButton
                      label="Delete"
                      confirmLabel="Yes, delete"
                      note={definition.deleteNote}
                      action={remove.bind(null, entity, row.key)}
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {table.length === 0 && (
          <p className="p-4 text-sm text-muted">
            {rows.length === 0 ? `No ${definition.title.toLowerCase()} yet. Add one above.` : "Nothing matches your search."}
          </p>
        )}
      </div>
    </div>
  );
}
