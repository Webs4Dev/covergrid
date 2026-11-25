import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { saveEdit } from "@/app/roster/actions";
import { ChangeForm } from "@/components/change-form";
import { ChangePreview, namesOf, showDate } from "@/components/change-preview";
import { STATUS } from "@/components/roster-grid";
import { describeChange } from "@/engine/change";
import { createDemand } from "@/engine/demand";
import { EDITABLE, planEdit, planNothing, type EditableStatus } from "@/lib/change-request";
import { isMonth } from "@/lib/months";

export const maxDuration = 60;
const text = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

export default async function EditDayPage({ searchParams }: PageProps<"/roster/edit">) {
  await connection();
  const query = await searchParams;
  const month = text(query.month);
  const date = text(query.date);
  const employeeId = /^\d{1,9}$/.test(text(query.employee)) ? Number(query.employee) : 0;
  if (!isMonth(month)) notFound();

  const base = await planNothing(month);
  const employee = base?.names.employees.find((e) => e.id === employeeId);
  const current = base?.roster.days.find((d) => d.employeeId === employeeId && d.date === date);
  if (!base || !employee || !current) notFound();

  const names = namesOf(base.names);
  const demand = createDemand(base.names);
  const work = base.names.assignments.filter((a) => a.employeeId === employeeId);
  const asked = EDITABLE.includes(text(query.status) as EditableStatus) ? (text(query.status) as EditableStatus) : null;
  const picked = [query.duty ?? []].flat().filter((v) => /^\d{1,9}$/.test(v)).map(Number).slice(0, 100);
  const change = asked ? await planEdit(month, employeeId, date, asked, picked) : null;
  const plan = change && describeChange(change.before, change.after);
  const worse = plan?.added.some((i) => i.severity === "must_fix") ?? false;
  const shownStatus = asked ?? (EDITABLE.includes(current.status as EditableStatus) ? current.status : "working");
  const shownDuties = asked ? picked : current.duties.map((d) => d.serviceId);

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4">
      <div>
        <Link href={`/roster?month=${month}&view=employee&id=${employeeId}`} className="btn-sm">Back to {employee.name}</Link>
        <h1 className="mt-3 text-2xl font-semibold">{employee.name}, {showDate(date)}</h1>
        <p className="text-sm text-muted">Now: {STATUS[current.status].label}{current.locked ? ", edited by hand" : ""}. For leave, add it under Time off.</p>
      </div>

      <form action="/roster/edit" className="panel space-y-4 p-4">
        <input type="hidden" name="month" value={month} />
        <input type="hidden" name="date" value={date} />
        <input type="hidden" name="employee" value={employeeId} />
        <label className="block max-w-xs text-sm font-medium">
          Status
          <select name="status" defaultValue={shownStatus} className="control mt-1">
            {EDITABLE.map((s) => <option key={s} value={s}>{STATUS[s].label}</option>)}
          </select>
        </label>
        <fieldset>
          <legend className="mb-1 text-sm font-medium">Work to cover (ignored on a day off)</legend>
          {work.length === 0 && <p className="text-sm text-muted">No work is assigned to this person yet.</p>}
          <div className="grid gap-1 sm:grid-cols-2">
            {work.map((a) => {
              const service = base.names.services.find((s) => s.id === a.serviceId)!;
              const need = demand(service, date);
              return (
                <label key={a.serviceId} className="flex items-center gap-2 py-1 text-sm">
                  <input type="checkbox" name="duty" value={a.serviceId} defaultChecked={shownDuties.includes(a.serviceId)} className="accent-accent" />
                  {names.service(a.serviceId)} <span className="text-xs text-muted">{a.role}, {need === 0 ? "closed" : `needs ${need}`}</span>
                </label>
              );
            })}
          </div>
        </fieldset>
        <button className="btn">Check the effect</button>
      </form>

      {plan && change && (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">What this would do</h2>
          {base.roster.status === "published" && <p className="rounded-md bg-warn-soft px-3 py-2 text-sm text-warn">This roster is published. The change will be recorded in its history.</p>}
          <ChangeForm
            key={JSON.stringify([asked, picked])}
            action={saveEdit.bind(null, month, employeeId, date, asked!, picked)}
            submitLabel={worse ? "Save anyway" : "Save change"}
          >
            <ChangePreview plan={plan} names={names} />
          </ChangeForm>
        </section>
      )}
    </div>
  );
}
