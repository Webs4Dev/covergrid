import Link from "next/link";
import { STATUS } from "@/components/roster-grid";
import { weekdayOf } from "@/engine/dates";
import type { Employee, Service } from "@/engine/types";
import type { RosterViewData } from "@/lib/roster-view";

const longDate = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const formatDate = (date: string) => longDate.format(new Date(`${date}T00:00:00Z`));

/** One person's month as a calendar. */
export function EmployeeCalendar({ view, employee, dayHref }: { view: RosterViewData; employee: Employee; dayHref: (date: string) => string }) {
  const lead = (weekdayOf(view.dates[0]) + 6) % 7; // weeks start on Monday
  const totals = new Map<string, number>();
  for (const date of view.dates) {
    const status = view.day(employee.id, date)?.status;
    if (status) totals.set(STATUS[status].label, (totals.get(STATUS[status].label) ?? 0) + 1);
  }
  return (
    <div>
      <p className="mb-3 text-sm text-muted">
        {[...totals].map(([label, n]) => `${label}: ${n}`).join(", ") || "Not in this roster yet."}
      </p>
      <div className="panel overflow-x-auto p-2">
        <div className="grid min-w-[40rem] grid-cols-7 gap-1 text-xs">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
            <div key={d} className="px-1 font-medium text-muted">{d}</div>
          ))}
          {Array.from({ length: lead }, (_, i) => <div key={`blank-${i}`} />)}
          {view.dates.map((date) => {
            const day = view.day(employee.id, date);
            const conflict = view.conflict(employee.id, date);
            return (
              <div key={date} className={`min-h-24 rounded-md border p-1.5 ${conflict.length > 0 ? "border-danger bg-danger-soft" : "border-line"} ${day && day.status !== "working" ? "bg-paper" : ""}`}>
                <div className="flex justify-between">
                  <Link href={dayHref(date)} prefetch={false} className="font-semibold hover:text-accent">{Number(date.slice(8))}</Link>
                  {day && <Link href={`/roster/edit?month=${date.slice(0, 7)}&date=${date}&employee=${employee.id}`} prefetch={false} className="text-accent underline">Edit</Link>}
                </div>
                {day && <p className="font-medium">{STATUS[day.status].label}</p>}
                <ul className="text-muted">
                  {day?.duties.map((d) => (
                    <li key={d.serviceId}>{view.serviceName(d.serviceId)}{d.isBackup && <span className="text-accent"> (backup)</span>}</li>
                  ))}
                </ul>
                {conflict.map((c) => <p key={c} className="font-medium text-danger">{c}</p>)}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** Everything about one date: who is working, who is off, and whether work is covered. */
export function DayDetail({ view, date, employees, services }: { view: RosterViewData; date: string; employees: Employee[]; services: Service[] }) {
  const people = employees.map((e) => ({ e, day: view.day(e.id, date), conflict: view.conflict(e.id, date) }));
  const working = people.filter((p) => p.day?.status === "working" && p.conflict.length === 0);
  const away = people.filter((p) => p.day && !working.includes(p));
  const open = services
    .map((s) => ({ s, ...view.coverage(s, date) }))
    .filter((c) => c.need > 0)
    .sort((a, b) => Number(a.have >= a.need) - Number(b.have >= b.need) || view.serviceName(a.s.id).localeCompare(view.serviceName(b.s.id)));
  const short = open.filter((c) => c.have < c.need).length;

  return (
    <div>
      <h2 className="text-lg font-semibold">{formatDate(date)}</h2>
      <p className={`mb-4 text-sm ${short > 0 ? "font-medium text-danger" : "text-muted"}`}>
        {short > 0 ? `${short} of ${open.length} brand processes are short of people.` : `All ${open.length} open brand processes are covered.`}
      </p>
      <div className="grid gap-4 lg:grid-cols-3">
        <section className="panel p-3">
          <h3 className="mb-2 font-semibold">Working ({working.length})</h3>
          <ul className="space-y-2 text-sm">
            {working.map(({ e, day }) => (
              <li key={e.id}>
                {e.name}
                <span className="block text-xs text-muted">
                  {day!.duties.map((d) => view.serviceName(d.serviceId) + (d.isBackup ? " (backup)" : "")).join(", ") || "No client work today"}
                </span>
              </li>
            ))}
          </ul>
        </section>
        <section className="panel p-3">
          <h3 className="mb-2 font-semibold">Not working ({away.length})</h3>
          <ul className="space-y-1 text-sm">
            {away.map(({ e, day, conflict }) => (
              <li key={e.id} className="flex justify-between gap-2">
                {e.name}
                <span className={conflict.length > 0 ? "text-danger" : "text-muted"}>
                  {conflict.length > 0 ? "Cannot work" : STATUS[day!.status].label}
                </span>
              </li>
            ))}
          </ul>
        </section>
        <section className="panel p-3">
          <h3 className="mb-2 font-semibold">Coverage</h3>
          <ul className="space-y-1 text-sm">
            {open.map(({ s, need, have }) => (
              <li key={s.id} className={`flex justify-between gap-2 ${have < need ? "font-medium text-danger" : ""}`}>
                {view.serviceName(s.id)}
                <span className="tabular-nums">{have} of {need}{have < need ? " short" : ""}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
