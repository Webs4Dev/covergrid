// The numbers and task list on the dashboard. Pure functions, so they can be tested.
import type { Issue } from "../engine/check.ts";
import { monthDates, weekdayOf } from "../engine/dates.ts";
import { createDemand } from "../engine/demand.ts";
import type { RosterDay, RosterInput } from "../engine/types.ts";
import type { CheckInput } from "../engine/check.ts";
import { createView } from "./roster-view.ts";

export type DaySummary = { date: string; short: number; open: number; holiday: boolean };
export type Totals = { needed: number; covered: number };

export function summarise(input: CheckInput, days: RosterDay[] | null) {
  const view = days ? createView(input, days) : null;
  const demand = createDemand(input as RosterInput);
  const holidays = new Set(input.holidays.map((h) => h.date));
  const totals: Totals = { needed: 0, covered: 0 };
  const shortServices = new Set<number>();
  const calendar: DaySummary[] = monthDates(input.month).map((date) => {
    let short = 0;
    let open = 0;
    for (const s of input.services) {
      const need = demand(s, date);
      if (need === 0) continue;
      open++;
      totals.needed += need;
      if (!view) continue;
      const { have } = view.coverage(s, date);
      totals.covered += Math.min(have, need);
      if (have < need) {
        short++;
        shortServices.add(s.id);
      }
    }
    return { date, short, open, holiday: holidays.has(date) };
  });
  /** Blank cells before the 1st, for a week that starts on Monday. */
  const lead = (weekdayOf(calendar[0].date) + 6) % 7;
  return { calendar, lead, totals, shortServices };
}

export type Task = {
  key: string;
  kind: "problem" | "leave" | "step";
  title: string;
  detail: string;
  href: string;
  action: string;
};

type Request = { id: number; name: string; startDate: string; endDate: string };

/** What the manager should do, most urgent first. */
export function buildTasks(args: {
  month: string;
  roster: { status: "draft" | "published" } | null;
  issues: Issue[];
  outdated: number;
  requests: Request[];
  format: (date: string) => string;
}): Task[] {
  const { month, roster, issues, outdated, requests, format } = args;
  const tasks: Task[] = [];
  if (!roster) {
    tasks.push({ key: "generate", kind: "step", title: "Generate the roster", detail: "Plan everyone's working days and days off.", href: `/roster?month=${month}`, action: "Start" });
  }
  if (outdated > 0) {
    tasks.push({ key: "repair", kind: "problem", title: "Update the roster", detail: `Data changed: ${outdated} ${outdated === 1 ? "day needs" : "days need"} an update.`, href: `/roster/repair?month=${month}`, action: "Review" });
  }
  for (const [i, issue] of issues.filter((x) => x.severity === "must_fix").entries()) {
    const gap = (issue.code === "no_cover" || issue.code === "short_staffed") && issue.date;
    tasks.push({
      key: `problem-${i}`,
      kind: "problem",
      title: issue.message,
      detail: issue.date ? format(issue.date) : "This month",
      href: gap ? `/roster/fix?month=${month}&service=${issue.serviceIds[0]}&date=${issue.date}` : `/roster?month=${month}&view=problems`,
      action: gap ? "Find a fix" : "See why",
    });
  }
  for (const r of requests) {
    const range = r.startDate === r.endDate ? format(r.startDate) : `${format(r.startDate)} to ${format(r.endDate)}`;
    tasks.push({ key: `leave-${r.id}`, kind: "leave", title: `${r.name} asked for time off`, detail: range, href: `/roster/leave?id=${r.id}`, action: "Review" });
  }
  if (roster?.status === "draft") {
    tasks.push({ key: "publish", kind: "step", title: "Publish the roster", detail: "Makes this month's plan final.", href: `/roster?month=${month}&view=problems`, action: "Publish" });
  }
  return tasks;
}
