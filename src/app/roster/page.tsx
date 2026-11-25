import Link from "next/link";
import { connection } from "next/server";
import { generate, publish, unpublish } from "@/app/actions";
import { ConfirmButton } from "@/components/confirm-button";
import { GenerateButton } from "@/components/generate-button";
import { ProblemList } from "@/components/problem-list";
import { PublishForm } from "@/components/publish-form";
import { DayDetail, EmployeeCalendar } from "@/components/roster-detail";
import { CoverageGrid, Legend, PeopleGrid } from "@/components/roster-grid";
import { loadChanges, loadInput, loadRoster } from "@/db/roster";
import { canPublish, checkRoster } from "@/engine/check";
import type { Employee } from "@/engine/types";
import { isMonth, monthChoices, monthLabel, nextMonth } from "@/lib/months";
import { createView } from "@/lib/roster-view";

// Generating a month takes a few seconds on a small server.
export const maxDuration = 60;

const VIEWS = { company: "Company", pod: "Pod", brand: "Brand", process: "Process", employee: "Employee", problems: "Problems" } as const;
type View = keyof typeof VIEWS | "day";

const when = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });
const text = (value: string | string[] | undefined) => (typeof value === "string" ? value : "");

export default async function RosterPage({ searchParams }: PageProps<"/roster">) {
  await connection();
  const query = await searchParams;
  const month = isMonth(text(query.month)) ? text(query.month) : nextMonth();
  const view: View = text(query.view) in VIEWS || text(query.view) === "day" ? (text(query.view) as View) : "company";
  const [input, roster] = await Promise.all([loadInput(month), loadRoster(month)]);
  const months = [...new Set([...monthChoices(), month])].sort();
  const href = (params: Record<string, string | number>) =>
    `/roster?${new URLSearchParams({ month, view, ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])) })}`;

  const header = (
    <>
      <h1 className="text-2xl font-semibold">Roster</h1>
      <form action="/roster" className="mt-3 flex flex-wrap items-end gap-2">
        <input type="hidden" name="view" value={view === "day" ? "company" : view} />
        <label className="text-sm font-medium">
          Month
          <select name="month" defaultValue={month} key={month} className="control mt-1">
            {months.map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
          </select>
        </label>
        <button className="btn">Show month</button>
      </form>
    </>
  );

  if (!roster) {
    return (
      <div>
        {header}
        <section className="panel mt-6 max-w-xl p-6">
          <h2 className="text-lg font-semibold">No roster for {monthLabel(month)} yet</h2>
          <p className="mt-1 mb-4 text-sm text-muted">
            Generating plans every active employee&apos;s working days and days off, using approved time off only.
          </p>
          <GenerateButton action={generate.bind(null, month)} label={`Generate ${monthLabel(month)}`} />
        </section>
      </div>
    );
  }

  const changes = await loadChanges(roster.id);
  const data = createView(input, roster.days);
  const issues = checkRoster(input, roster.days);
  const mustFix = issues.filter((i) => i.severity === "must_fix").length;
  const dayHref = (date: string) => href({ view: "day", date });
  const employeeHref = (id: number) => href({ view: "employee", id });
  const byName = <T extends { name: string }>(list: T[]) => [...list].sort((a, b) => a.name.localeCompare(b.name));
  const people = (list: Employee[]) => byName(list).map((employee) => ({ employee }));

  // The thing being looked at in the pod, brand, process and employee views.
  const choices: Record<string, { id: number; name: string }[]> = {
    pod: byName(input.pods),
    brand: byName(input.brands),
    process: byName(input.processes.filter((p) => input.services.some((s) => s.processId === p.id))),
    employee: byName(input.employees),
  };
  const list = choices[view] ?? [];
  const chosen = list.find((x) => String(x.id) === text(query.id)) ?? list[0];

  function content() {
    if (view === "company") {
      return (
        <PeopleGrid
          view={data} caption={`Company roster, ${monthLabel(month)}`} dayHref={dayHref} employeeHref={employeeHref}
          groups={byName(input.pods)
            .map((pod) => ({ title: `Pod ${pod.name}`, people: people(input.employees.filter((e) => e.podId === pod.id)) }))
            .filter((g) => g.people.length > 0)}
        />
      );
    }
    if (view === "problems") {
      return <ProblemList issues={issues} href={href} brandOfService={new Map(input.services.map((s) => [s.id, s.brandId]))} />;
    }
    if (view === "day") {
      const date = data.dates.includes(text(query.date)) ? text(query.date) : data.dates[0];
      return <DayDetail view={data} date={date} employees={byName(input.employees)} services={input.services} />;
    }
    if (!chosen) return <p className="text-sm text-muted">Nothing to show here yet.</p>;

    if (view === "employee") {
      const employee = input.employees.find((e) => e.id === chosen.id)!;
      return <EmployeeCalendar view={data} employee={employee} dayHref={dayHref} />;
    }

    if (view === "pod") {
      const leadId = input.pods.find((p) => p.id === chosen.id)?.leadId;
      const team = input.employees.filter((e) => e.podId === chosen.id);
      const brandIds = new Set(input.brands.filter((b) => b.podId === chosen.id).map((b) => b.id));
      return (
        <>
          <p className="text-sm">Pod lead: <strong>{input.employees.find((e) => e.id === leadId)?.name ?? "None yet"}</strong></p>
          <PeopleGrid
            view={data} caption={`Pod ${chosen.name}`} dayHref={dayHref} employeeHref={employeeHref}
            groups={[{ title: null, people: byName(team).map((employee) => ({ employee, note: employee.id === leadId ? "lead" : undefined })) }]}
          />
          <h2 className="text-lg font-semibold">Coverage of this pod&apos;s brands</h2>
          <CoverageGrid view={data} caption="Coverage" dayHref={dayHref} services={input.services.filter((s) => brandIds.has(s.brandId))} />
        </>
      );
    }

    const services = input.services.filter((s) => (view === "brand" ? s.brandId : s.processId) === chosen.id);
    const mine = input.assignments.filter((a) => services.some((s) => s.id === a.serviceId));
    const rows = (role: "primary" | "backup") =>
      byName(input.employees.filter((e) => {
        const roles = mine.filter((a) => a.employeeId === e.id).map((a) => a.role);
        return role === "primary" ? roles.includes("primary") : roles.length > 0 && !roles.includes("primary");
      })).map((employee) => ({
        employee,
        note: view === "brand"
          ? mine.filter((a) => a.employeeId === employee.id)
              .map((a) => input.processes.find((p) => p.id === services.find((s) => s.id === a.serviceId)!.processId)?.code)
              .join(", ")
          : undefined,
      }));
    return (
      <>
        <CoverageGrid view={data} caption={`Coverage for ${chosen.name}`} dayHref={dayHref} services={services} />
        <h2 className="text-lg font-semibold">Assigned people</h2>
        <p className="text-xs text-muted">Cells show each person&apos;s whole day, which can include work for other brands.</p>
        <PeopleGrid
          view={data} caption={`People for ${chosen.name}`} dayHref={dayHref} employeeHref={employeeHref}
          groups={[{ title: "Primary", people: rows("primary") }, { title: "Backup only", people: rows("backup") }].filter((g) => g.people.length > 0)}
        />
      </>
    );
  }

  return (
    <div>
      {header}

      <div className="panel mt-4 flex flex-wrap items-center justify-between gap-3 p-3">
        <div className="text-sm">
          <p>
            <strong>{monthLabel(month)}</strong>, {roster.status}
            {roster.publishedAt && ` on ${when.format(roster.publishedAt)}`}.{" "}
            {canPublish(issues) ? (
              <span>No must-fix problems.</span>
            ) : (
              <Link href={href({ view: "problems" })} className="font-medium text-danger underline">
                {mustFix} must-fix {mustFix === 1 ? "problem" : "problems"}.
              </Link>
            )}{" "}
            <span className="text-muted">{issues.length - mustFix} preference notes.</span>
          </p>
          {roster.overrideReason && <p className="mt-1 text-muted">Published anyway because: {roster.overrideReason}</p>}
          {roster.status === "published" && mustFix > 0 && !roster.overrideReason && (
            <p role="alert" className="mt-1 font-medium text-danger">Something changed after publishing. Check the problems.</p>
          )}
        </div>
        {roster.status === "draft" ? (
          <div className="flex flex-wrap items-start gap-2">
          <Link href={href({ view: "problems" })} className="btn btn-primary">Review and publish</Link>
          <ConfirmButton
            label="Generate again" confirmLabel="Yes, replace it"
            note="Builds the month again from the current data and replaces this draft."
            action={generate.bind(null, month)}
          />
          </div>
        ) : (
          <ConfirmButton
            label="Return to draft" confirmLabel="Yes, unpublish"
            note="The roster can be changed again. Comp-offs earned by publishing it are removed."
            action={unpublish.bind(null, month)}
          />
        )}
      </div>

      <nav aria-label="Roster views" className="mt-4 flex flex-wrap gap-1">
        {Object.entries(VIEWS).map(([key, label]) => (
          <Link
            key={key} href={`/roster?month=${month}&view=${key}`} aria-current={view === key ? "page" : undefined}
            className="btn aria-[current=page]:border-accent aria-[current=page]:bg-accent aria-[current=page]:text-white"
          >
            {key === "problems" ? `${label} (${issues.length})` : label}
          </Link>
        ))}
      </nav>

      {list.length > 0 && chosen && (
        <form action="/roster" className="mt-3 flex flex-wrap items-end gap-2">
          <input type="hidden" name="month" value={month} />
          <input type="hidden" name="view" value={view} />
          <label className="text-sm font-medium">
            {VIEWS[view as keyof typeof VIEWS]}
            <select name="id" defaultValue={chosen.id} key={`${view}-${chosen.id}`} className="control mt-1">
              {list.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </label>
          <button className="btn">Show</button>
        </form>
      )}

      <div className="mt-4 space-y-4">
        {!["day", "employee", "problems"].includes(view) && <Legend />}
        {content()}
        {!["day", "problems"].includes(view) && <p className="text-xs text-muted">Select a date number to see who is working that day.</p>}
        {view === "problems" && roster.status === "draft" && (
          <div className="max-w-3xl">
            <PublishForm action={publish.bind(null, month)} mustFix={mustFix} />
          </div>
        )}
        {view === "problems" && changes.length > 0 && (
          <section className="max-w-3xl">
            <h2 className="mb-1 font-semibold">History</h2>
            <ul className="text-sm text-muted">
              {changes.map((c) => <li key={c.id}>{when.format(c.createdAt)}: {c.summary}</li>)}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
