import { STATUS } from "@/components/roster-grid";
import type { DayChange, Fix, Plan } from "@/engine/change";
import type { Issue } from "@/engine/check";
import type { RosterDay } from "@/engine/types";

const day = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
export const showDate = (date: string) => day.format(new Date(`${date}T00:00:00Z`));
export const readable = (text: string) => text.replace(/\d{4}-\d\d-\d\d/g, showDate);

type Names = { employee: (id: number) => string; service: (id: number) => string };

function describe(d: RosterDay | null, names: Names) {
  if (!d) return "Not in the roster";
  const work = d.duties.map((x) => names.service(x.serviceId) + (x.isBackup ? " (backup)" : "")).join(", ");
  return STATUS[d.status].label + (work ? `: ${work}` : "");
}

export function ChangeTable({ changes, names }: { changes: DayChange[]; names: Names }) {
  if (changes.length === 0) return <p className="text-sm text-muted">No days change.</p>;
  return (
    <div className="panel relative overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-line text-muted">
            {["Date", "Employee", "Now", "After"].map((h) => <th key={h} scope="col" className="px-3 py-2 font-medium">{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {changes.map(({ before, after }) => {
            const d = (after ?? before)!;
            return (
              <tr key={`${d.employeeId}-${d.date}`} className="border-b border-line align-top last:border-0">
                <td className="px-3 py-2 whitespace-nowrap">{showDate(d.date)}</td>
                <td className="px-3 py-2 whitespace-nowrap">{names.employee(d.employeeId)}</td>
                <td className="px-3 py-2 text-muted">{describe(before, names)}</td>
                <td className="px-3 py-2">{describe(after, names)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function FixChoices({ issue, fixes, preselect }: { issue: Issue; fixes: Fix[]; preselect?: boolean }) {
  const name = `fix-${issue.serviceIds[0]}-${issue.date}`;
  return (
    <fieldset className="rounded-[10px] border border-danger/40 bg-danger-soft p-3">
      <legend className="sr-only">{issue.message}</legend>
      <p className="text-sm font-medium"><span className="text-danger">Must fix</span>, {showDate(issue.date!)}: {issue.message}</p>
      <ul className="mt-1 mb-2 list-disc pl-5 text-sm text-muted">
        {issue.reasons.map((r) => <li key={r}>{readable(r)}</li>)}
      </ul>
      {fixes.length === 0 ? (
        <p className="text-sm">No one available can fill this without breaking another rule. Change the date, the need or the team.</p>
      ) : (
        <div className="space-y-2">
          {fixes.map((fix, i) => (
            <label key={fix.key} className="flex items-start gap-2 rounded-md bg-surface p-2 text-sm">
              <input type="radio" name={name} value={fix.key} defaultChecked={preselect && i === 0} className="mt-1 accent-accent" />
              <span>{readable(fix.label)}<span className="block text-xs text-muted">{fix.detail}</span></span>
            </label>
          ))}
          <label className="flex items-center gap-2 rounded-md bg-surface p-2 text-sm">
            <input type="radio" name={name} value="" defaultChecked={!preselect} className="accent-accent" />
            Leave this gap open for now
          </label>
        </div>
      )}
    </fieldset>
  );
}

function IssueLines({ title, issues, style }: { title: string; issues: Issue[]; style: string }) {
  if (issues.length === 0) return null;
  return (
    <div>
      <h3 className="text-sm font-semibold">{title}</h3>
      <ul className={`list-disc pl-5 text-sm ${style}`}>
        {issues.map((i, n) => <li key={n}>{i.date && `${showDate(i.date)}: `}{readable(i.message)}</li>)}
      </ul>
    </div>
  );
}

/** What a change does: days that change, problems solved, new problems, and choices. */
export function ChangePreview({ plan, names }: { plan: Plan; names: Names }) {
  const other = plan.added.filter((i) => !plan.gaps.some((g) => g.issue === i));
  return (
    <div className="space-y-4">
      <div>
        <h3 className="mb-1 font-semibold">Days that change ({plan.changes.length})</h3>
        <ChangeTable changes={plan.changes} names={names} />
      </div>
      {plan.added.every((i) => i.severity === "preference") && (
        <p className="rounded-md bg-accent-soft px-3 py-2 text-sm">No new must-fix problems.</p>
      )}
      <IssueLines title="Solved" issues={plan.resolved} style="text-muted" />
      <IssueLines title="New must-fix problems" issues={other.filter((i) => i.severity === "must_fix")} style="text-danger" />
      <IssueLines title="New preference notes" issues={other.filter((i) => i.severity === "preference")} style="text-warn" />
      {plan.gaps.length > 0 && <h3 className="font-semibold">Coverage gaps this creates ({plan.gaps.length})</h3>}
      {plan.gaps.map((g) => <FixChoices key={`${g.issue.serviceIds[0]}-${g.issue.date}`} issue={g.issue} fixes={g.fixes} />)}
    </div>
  );
}

export const namesOf = (input: {
  employees: { id: number; name: string }[];
  services: { id: number; brandId: number; processId: number }[];
  brands: { id: number; name: string }[];
  processes: { id: number; code: string }[];
}): Names => ({
  employee: (id) => input.employees.find((e) => e.id === id)?.name ?? "Someone switched off",
  service: (id) => {
    const s = input.services.find((x) => x.id === id);
    return s ? `${input.brands.find((b) => b.id === s.brandId)?.name} ${input.processes.find((p) => p.id === s.processId)?.code}` : "Removed work";
  },
});
