import Link from "next/link";
import { weekdayOf } from "@/engine/dates";
import type { DayStatus, Employee, Service } from "@/engine/types";
import type { RosterViewData } from "@/lib/roster-view";

export const STATUS: Record<DayStatus, { code: string; label: string; style: string }> = {
  working: { code: "W", label: "Working", style: "" },
  weekly_off: { code: "O", label: "Weekly off", style: "bg-line/60" },
  holiday: { code: "H", label: "Public holiday", style: "bg-line/60" },
  leave: { code: "L", label: "Leave", style: "bg-ink text-white" },
  comp_off: { code: "C", label: "Comp-off", style: "bg-ink text-white" },
  unavailable: { code: "U", label: "Unavailable", style: "bg-muted text-white" },
};

export function Legend() {
  const item = (code: string, label: string, style: string) => (
    <li key={label} className="flex items-center gap-1.5">
      <span className={`inline-flex size-5 items-center justify-center rounded border border-line text-xs ${style}`}>{code}</span>
      {label}
    </li>
  );
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
      {Object.values(STATUS).map((s) => item(s.code, s.label, s.style))}
      {item("B", "Covering as backup", "bg-accent text-white")}
      {item("!", "Short of people, or cannot work", "bg-danger text-white")}
    </ul>
  );
}

const LETTERS = "SMTWTFS";
const cell = "h-7 min-w-7 border-l border-line px-1 text-center text-xs";
const stickyName = "sticky left-0 z-10 bg-surface px-3 py-1 text-left font-normal whitespace-nowrap border-r border-line";

function DateHeader({ view, first, dayHref }: { view: RosterViewData; first: string; dayHref: (date: string) => string }) {
  return (
    <thead>
      <tr className="border-b border-line">
        <th scope="col" className={`${stickyName} font-medium text-muted`}>{first}</th>
        {view.dates.map((date) => (
          <th key={date} scope="col" className={`${cell} font-medium ${[0, 6].includes(weekdayOf(date)) ? "bg-paper" : ""}`}>
            <Link href={dayHref(date)} className="block hover:text-accent" aria-label={`See ${date}`}>
              <span className="block text-muted">{LETTERS[weekdayOf(date)]}</span>
              {Number(date.slice(8))}
            </Link>
          </th>
        ))}
      </tr>
    </thead>
  );
}

type GridProps = {
  view: RosterViewData;
  caption: string;
  dayHref: (date: string) => string;
  groups: { title: string | null; people: { employee: Employee; note?: string }[] }[];
  employeeHref: (id: number) => string;
};

/** People down the side, days across the top. */
export function PeopleGrid({ view, caption, groups, dayHref, employeeHref }: GridProps) {
  return (
    <div className="panel relative overflow-x-auto">
      <table className="border-collapse tabular-nums">
        <caption className="sr-only">{caption}</caption>
        <DateHeader view={view} first="Employee" dayHref={dayHref} />
        {groups.map((group) => (
          <tbody key={group.title ?? "all"}>
            {group.title && (
              <tr className="border-b border-line bg-accent-soft">
                <th scope="colgroup" colSpan={view.dates.length + 1} className="px-3 py-1 text-left text-sm">
                  <span className="sticky left-3">{group.title}</span>
                </th>
              </tr>
            )}
            {group.people.map(({ employee, note }) => (
              <tr key={employee.id} className="border-b border-line">
                <th scope="row" className={`${stickyName} text-sm`}>
                  <Link href={employeeHref(employee.id)} className="hover:text-accent hover:underline">{employee.name}</Link>
                  {note && <span className="ml-1 text-xs text-muted">{note}</span>}
                </th>
                {view.dates.map((date) => {
                  const day = view.day(employee.id, date);
                  if (!day) return <td key={date} className={`${cell} text-muted`}>-</td>;
                  const conflict = view.conflict(employee.id, date);
                  const backup = day.duties.some((d) => d.isBackup);
                  const base = STATUS[day.status];
                  const code = conflict.length > 0 ? "!" : backup ? "B" : base.code;
                  const style = conflict.length > 0 ? "bg-danger font-bold text-white" : backup ? "bg-accent text-white" : base.style;
                  const detail = [
                    base.label,
                    ...day.duties.map((d) => `${view.serviceName(d.serviceId)}${d.isBackup ? " (backup)" : ""}`),
                    ...conflict,
                  ].join(", ");
                  return (
                    <td key={date} className={`${cell} ${style}`} title={detail}>
                      <span aria-hidden>{code}</span>
                      <span className="sr-only">{detail}</span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        ))}
      </table>
    </div>
  );
}

/** Services down the side: people at work against people needed, each day. */
export function CoverageGrid({ view, caption, services, dayHref }: { view: RosterViewData; caption: string; services: Service[]; dayHref: (date: string) => string }) {
  return (
    <div className="panel relative overflow-x-auto">
      <table className="border-collapse tabular-nums">
        <caption className="sr-only">{caption}</caption>
        <DateHeader view={view} first="People at work / needed" dayHref={dayHref} />
        <tbody>
          {services.map((s) => (
            <tr key={s.id} className="border-b border-line">
              <th scope="row" className={`${stickyName} text-sm`}>{view.serviceName(s.id)}</th>
              {view.dates.map((date) => {
                const { need, have } = view.coverage(s, date);
                const short = have < need;
                const detail = need === 0 ? "Closed" : `${have} of ${need} needed${short ? ": short" : ""}`;
                return (
                  <td key={date} title={detail} className={`${cell} ${short ? "bg-danger font-bold text-white" : need === 0 ? "bg-line/60 text-muted" : "bg-accent-soft"}`}>
                    <span aria-hidden>{need === 0 ? "-" : `${have}/${need}`}</span>
                    <span className="sr-only">{detail}</span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
