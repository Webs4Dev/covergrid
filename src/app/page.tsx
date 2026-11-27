import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { connection } from "next/server";
import { reset } from "@/app/actions";
import { ConfirmButton } from "@/components/confirm-button";
import { getDb } from "@/db";
import { checkDatabase } from "@/db/check";
import { loadInput, loadRoster } from "@/db/roster";
import { employees, timeOff } from "@/db/schema";
import { changedDays, repair } from "@/engine/change";
import { checkRoster } from "@/engine/check";
import { buildTasks, summarise, type Task } from "@/lib/dashboard";
import { isMonth, monthChoices, monthLabel, nextMonth } from "@/lib/months";

export const maxDuration = 60;

const shortDate = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const format = (date: string) => shortDate.format(new Date(`${date}T00:00:00Z`));

const TASK_STYLE: Record<Task["kind"], { tag: string; box: string; text: string }> = {
  problem: { tag: "Problem", box: "border-danger/40 bg-danger-soft", text: "text-danger" },
  leave: { tag: "Leave request", box: "border-line bg-surface", text: "text-accent" },
  step: { tag: "Next step", box: "border-line bg-accent-soft", text: "text-muted" },
};

export default async function Dashboard({ searchParams }: PageProps<"/">) {
  await connection();
  const query = await searchParams;
  const problem = await checkDatabase();
  if (problem) {
    console.error(`Database check failed: ${problem}`);
    return (
      <div role="alert" className="p-6">
        <h1 className="text-2xl font-semibold">Database not connected</h1>
        <p className="mt-2 text-muted">{process.env.NODE_ENV === "development" ? problem : "Please try again in a minute."}</p>
      </div>
    );
  }

  const month = typeof query.month === "string" && isMonth(query.month) ? query.month : nextMonth();
  const [input, roster, requests] = await Promise.all([
    loadInput(month),
    loadRoster(month),
    getDb()
      .select({ id: timeOff.id, name: employees.name, startDate: timeOff.startDate, endDate: timeOff.endDate, reason: timeOff.reason })
      .from(timeOff)
      .innerJoin(employees, eq(employees.id, timeOff.employeeId))
      .where(eq(timeOff.status, "requested"))
      .orderBy(asc(timeOff.startDate)),
  ]);

  const issues = roster ? checkRoster(input, roster.days) : [];
  const repaired = roster ? repair(input, roster.days) : [];
  const outdated = roster ? changedDays(roster.days, repaired).length : 0;
  const afterRepair = outdated > 0 ? checkRoster(input, repaired) : undefined;
  const { calendar, lead, totals, shortServices } = summarise(input, roster?.days ?? null);
  const tasks = buildTasks({ month, roster, issues, outdated, afterRepair, requests, format });
  const monthStart = calendar[0].date;
  const monthEnd = calendar[calendar.length - 1].date;
  const KIND = {
    leave: { label: "Leave", style: "text-accent" },
    comp_off: { label: "Comp-off", style: "text-muted" },
    unavailable: { label: "Unavailable", style: "text-ink" },
  } as const;
  const away = input.timeOff
    .filter((t) => t.status === "approved" && t.startDate <= monthEnd && t.endDate >= monthStart)
    .sort((a, b) => a.startDate.localeCompare(b.startDate))
    .map((t) => ({
      id: t.id,
      name: input.employees.find((e) => e.id === t.employeeId)?.name ?? "Someone switched off",
      kind: KIND[t.kind],
      reason: t.reason,
      when: t.startDate === t.endDate ? format(t.startDate) : `${format(t.startDate)} to ${format(t.endDate)}`,
    }));
  const mustFix = issues.filter((i) => i.severity === "must_fix").length;
  const open = tasks.filter((t) => t.kind !== "step").length;

  const stats = [
    { label: "Places covered", value: roster ? totals.covered.toLocaleString("en-GB") : "-", note: `of ${totals.needed.toLocaleString("en-GB")} needed`, href: `/roster?month=${month}`, bad: false },
    { label: "Must fix", value: roster ? mustFix : "-", note: mustFix === 1 ? "problem" : "problems", href: `/roster?month=${month}&view=problems`, bad: mustFix > 0 },
    { label: "Leave to review", value: requests.length, note: requests.length === 1 ? "request waiting" : "requests waiting", href: "/manage/time-off?q=requested", bad: false },
    { label: "Preference notes", value: roster ? issues.length - mustFix : "-", note: "wishes not met", href: `/roster?month=${month}&view=problems`, bad: false },
  ];

  const pods = [...input.pods].sort((a, b) => a.name.localeCompare(b.name)).map((pod) => {
    const brandIds = new Set(input.brands.filter((b) => b.podId === pod.id).map((b) => b.id));
    const short = new Set(input.services.filter((s) => brandIds.has(s.brandId) && shortServices.has(s.id)).map((s) => s.brandId));
    return {
      ...pod,
      lead: input.employees.find((e) => e.id === pod.leadId)?.name ?? "No lead yet",
      people: input.employees.filter((e) => e.podId === pod.id).length,
      brands: brandIds.size,
      short: short.size,
    };
  });

  return (
    <div className="flex flex-col gap-3 p-4 lg:h-full lg:min-h-0">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">{monthLabel(month)}</h1>
          <p className="text-sm text-muted">
            {!roster ? "No roster yet" : roster.status === "published" ? "Published roster" : "Draft roster"}
            {open > 0 ? `, ${open} ${open === 1 ? "thing needs" : "things need"} you` : roster ? ", nothing waiting" : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <form action="/" className="flex gap-2">
            <select name="month" aria-label="Month" defaultValue={month} key={month} className="control w-auto">
              {[...new Set([...monthChoices(), month])].sort().map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
            </select>
            <button className="btn">Show</button>
          </form>
          <Link href={`/roster?month=${month}`} className="btn btn-primary">{roster ? "Open roster" : "Generate roster"}</Link>
        </div>
      </header>

      {query.done === "reset" && <p role="status" className="rounded-md bg-accent-soft px-3 py-2 text-sm">Sample data restored.</p>}

      <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => (
          <li key={s.label}>
            <Link href={s.href} className={`panel block px-4 py-2.5 hover:border-accent ${s.bad ? "border-danger" : ""}`}>
              <span className={`block text-sm ${s.bad ? "text-danger" : "text-muted"}`}>{s.label}</span>
              <span className={`text-2xl font-bold tabular-nums ${s.bad ? "text-danger" : ""}`}>{s.value}</span>{" "}
              <span className="text-sm text-muted">{s.note}</span>
            </Link>
          </li>
        ))}
      </ul>

      <div className="grid gap-3 lg:min-h-0 lg:flex-1 lg:grid-cols-5">
        <section className="panel flex min-h-0 flex-col p-3 lg:col-span-2">
          <h2 className="mb-2 font-semibold">To do ({tasks.length})</h2>
          {tasks.length === 0 && <p className="text-sm text-muted">All done for this month.</p>}
          <ul className="space-y-2 lg:min-h-0 lg:shrink lg:basis-auto lg:overflow-y-auto">
            {tasks.map((task) => (
              <li key={task.key} className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2 ${TASK_STYLE[task.kind].box}`}>
                <div className="min-w-0">
                  <p className={`text-xs font-semibold ${TASK_STYLE[task.kind].text}`}>{TASK_STYLE[task.kind].tag}</p>
                  <p className="text-sm font-semibold">{task.title}</p>
                  <p className="text-xs text-muted">{task.detail}</p>
                  {task.reason && <p className="text-xs text-muted">Reason: <span className="font-semibold text-ink">{task.reason}</span></p>}
                </div>
                <Link href={task.href} className="btn shrink-0">{task.action}</Link>
              </li>
            ))}
          </ul>

          <h2 className="mt-4 mb-1 font-semibold">Time off this month ({away.length})</h2>
          {away.length === 0 && <p className="text-sm text-muted">Nobody has approved time off.</p>}
          <ul className="space-y-1.5 text-sm lg:min-h-16 lg:flex-1 lg:basis-0 lg:overflow-y-auto">
            {away.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 rounded-lg bg-paper px-2.5 py-1.5">
                <div className="min-w-0">
                  <p className="font-semibold">{a.name}</p>
                  {a.reason && (
                    <p className="truncate text-xs text-muted" title={a.reason}>Reason: <span className="font-medium text-ink">{a.reason}</span></p>
                  )}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className={`tag ${a.kind.style}`}>{a.kind.label}</span>
                  <span className="text-xs font-semibold">{a.when}</span>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="panel flex min-h-0 flex-col p-3 lg:col-span-3">
          <div className="mb-2 flex flex-wrap justify-between gap-2">
            <h2 className="font-semibold">Day by day</h2>
            <p className="text-xs text-muted">{roster ? "Select a day to see who is working" : "Generate to see coverage"}</p>
          </div>
          <div className="grid grid-cols-7 gap-1 text-xs font-semibold text-muted">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <span key={d} className="px-1">{d}</span>)}
          </div>
          <div className="mt-1 grid min-h-0 flex-1 auto-rows-fr grid-cols-7 gap-1">
            {Array.from({ length: lead }, (_, i) => <span key={`blank-${i}`} />)}
            {calendar.map((d) => {
              const short = d.short > 0;
              const label = short ? `${d.short} short` : d.holiday ? "Holiday" : roster ? "Covered" : "";
              return (
                <Link
                  key={d.date}
                  href={roster ? `/roster?month=${month}&view=day&date=${d.date}` : `/roster?month=${month}`}
                  prefetch={false}
                  aria-label={`${format(d.date)}${label ? `: ${label}` : ""}`}
                  className={`flex min-h-10 flex-col justify-between overflow-hidden rounded-md border px-1.5 py-0.5 hover:border-accent ${short ? "border-danger bg-danger text-white" : d.holiday ? "border-line bg-accent-soft" : "border-line"}`}
                >
                  <span className="text-sm font-semibold">{Number(d.date.slice(8))}</span>
                  <span className={`truncate text-[11px] ${short ? "font-semibold" : "text-muted"}`}>{label}</span>
                </Link>
              );
            })}
          </div>
        </section>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {pods.map((pod) => (
          <Link key={pod.id} href={`/roster?month=${month}&view=pod&id=${pod.id}`} className="panel px-4 py-2.5 hover:border-accent">
            <span className="flex items-center justify-between gap-2">
              <span className="font-semibold">Pod {pod.name}</span>
              {roster && (
                <span className={`rounded px-1.5 text-xs font-semibold ${pod.short ? "bg-danger text-white" : "bg-accent-soft text-accent"}`}>
                  {pod.short ? `${pod.short} short` : "Covered"}
                </span>
              )}
            </span>
            <span className="block truncate text-xs text-muted">Lead: {pod.lead}</span>
            <span className="block text-xs text-muted">{pod.people} people, {pod.brands} brands</span>
          </Link>
        ))}
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
        <p>Demo with fictional data that anyone can edit.</p>
        <ConfirmButton label="Reset sample data" confirmLabel="Yes, reset" note="Deletes every change and saved roster, then loads the sample data again." action={reset} />
      </footer>
    </div>
  );
}
