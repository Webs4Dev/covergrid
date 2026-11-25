import { coverDay, type Candidate, type DayProblem } from "./cover-day.ts";
import { addDays, monthDates, weekdayOf, weekOf } from "./dates.ts";
import { createDemand } from "./demand.ts";
import type { DayStatus, Employee, RosterDay, RosterInput, Service } from "./types.ts";

// How the month is planned
//   1. Work out the need of every service on every date.
//   2. Block days people cannot work (approved time off, unavailable weekdays).
//   3. Give everyone their weekly offs, then improve the choice step by step
//      until no single change or two-person swap makes the month better.
//   4. For each day, cover-day.ts decides who covers what.
//
// Must-haves: approved time off, fixed offs, the number of weekly offs, shift and
// brand limits. Client coverage comes next (GAP_COST is far above any preference).
// Rest is never cancelled to fill a gap: the gap stays visible for the manager.
//
// Whole Monday-Sunday weeks are planned, even when a week crosses into the next
// month, so people are not forced to rest early. Only this month's days are returned.

const MISSED_PREFERENCE = 3; // grows with the square, so misses are shared out fairly
const NO_WEEKEND_OFF = 0.5; // also squared
const OFF_ON_HOLIDAY = 20; // keep the holiday and the weekly off as two separate days
const LONG_STRETCH = 2; // each day worked in a row beyond MAX_STRETCH
const MAX_STRETCH = 7;
const LEAD_AS_BACKUP = 2; // leads should be free to lead
const REPEAT_BACKUP = 0.1; // share backup work over the month

type Block = "leave" | "comp_off" | "unavailable";
type Plan = {
  employee: Employee;
  weeks: { dates: string[]; options: string[][] }[];
  choice: number[]; // index into options, per week
};

export function generateRoster(input: RosterInput): { days: RosterDay[]; exact: boolean } {
  const month = monthDates(input.month);
  const [first, last] = [month[0], month[month.length - 1]];
  const horizon: string[] = [];
  for (let d = first; d <= weekOf(last)[6]; d = addDays(d, 1)) horizon.push(d);

  const demand = createDemand(input);
  const holidays = new Set(input.holidays.map((h) => h.date));
  const leads = new Set(input.pods.map((p) => p.leadId));
  const maxBrands = new Map(input.employees.map((e) => [e.id, e.maxBrandsPerDay]));
  const known = new Set(input.employees.map((e) => e.id));
  const assignments = input.assignments.filter((a) => known.has(a.employeeId));
  const groups = connectedGroups(input.employees, input.services, assignments);

  const blocks = new Map<string, Block>();
  const block = (employee: Employee, date: string): Block | undefined => {
    const key = `${employee.id}|${date}`;
    return blocks.get(key) ?? (employee.unavailableDays.includes(weekdayOf(date)) ? "unavailable" : undefined);
  };
  for (const t of input.timeOff) {
    if (t.status !== "approved") continue;
    for (const d of horizon) {
      const key = `${t.employeeId}|${d}`;
      // Booked leave wins if two entries cover the same date.
      if (d >= t.startDate && d <= t.endDate && blocks.get(key) !== "leave") blocks.set(key, t.kind);
    }
  }

  const plans = new Map(input.employees.map((e) => [e.id, makePlan(e)]));

  function makePlan(employee: Employee): Plan {
    const weeks: Plan["weeks"] = [];
    for (let monday = weekOf(first)[0]; monday <= last; monday = addDays(monday, 7)) {
      const week = weekOf(monday);
      const dates = week.filter((d) => d >= first);
      const before = (input.history ?? []).filter((h) => h.employeeId === employee.id && week.includes(h.date) && h.date < first);
      const wanted =
        before.length > 0
          ? employee.weeklyOffCount - before.filter((h) => h.status === "weekly_off").length
          : Math.round((employee.weeklyOffCount * dates.length) / 7);

      const bookable = dates.filter((d) => !["leave", "comp_off"].includes(blocks.get(`${employee.id}|${d}`) ?? ""));
      const fixed = bookable.filter((d) => employee.fixedOffDays.includes(weekdayOf(d)));
      const free = bookable.filter((d) => !fixed.includes(d));
      const extra = Math.min(Math.max(0, wanted - fixed.length), free.length);
      weeks.push({ dates, options: combinations(free, extra).map((pick) => [...fixed, ...pick]) });
    }
    return { employee, weeks, choice: weeks.map(() => 0) };
  }

  const offDates = (plan: Plan) => new Set(plan.weeks.flatMap((w, i) => w.options[plan.choice[i]]));

  // ----- one day -----
  let exact = true;
  function problemFor(group: Group, date: string, atWork: Set<number>, extraCost: (id: number) => number): DayProblem {
    const candidates = new Map<number, Candidate[]>();
    for (const a of group.assignments) {
      if (!atWork.has(a.employeeId)) continue;
      const list = candidates.get(a.serviceId) ?? [];
      list.push({ employeeId: a.employeeId, isBackup: a.role === "backup" });
      candidates.set(a.serviceId, list);
    }
    const services = group.services.map((s) => ({
      id: s.id, brandId: s.brandId, shiftId: s.shiftId, need: demand(s, date),
    }));
    return { services, candidates, maxBrands, extraCost };
  }
  const leadCost = (id: number) => (leads.has(id) ? LEAD_AS_BACKUP : 0);
  const memo = new Map<string, number>();
  function dayCost(group: Group, groupIndex: number, date: string, off: Map<number, Set<string>>) {
    const atWork = group.employees.filter((e) => !block(e, date) && !off.get(e.id)!.has(date)).map((e) => e.id);
    const key = `${groupIndex}|${date}|${atWork.join()}`;
    let cost = memo.get(key);
    if (cost === undefined) {
      cost = coverDay(problemFor(group, date, new Set(atWork), leadCost)).cost;
      memo.set(key, cost);
    }
    return cost;
  }

  // ----- one person -----
  const isWeekend = (d: string) => weekdayOf(d) === 0 || weekdayOf(d) === 6;
  function personCost(plan: Plan) {
    const { employee } = plan;
    const off = offDates(plan);
    let misses = 0, weekendless = 0, cost = 0;
    plan.weeks.forEach((week, i) => {
      const picked = week.options[plan.choice[i]];
      if (picked.length === 0) return;
      if (employee.preferredOffDays.length > 0) {
        const chosen = picked.filter((d) => !employee.fixedOffDays.includes(weekdayOf(d)));
        misses += chosen.filter((d) => !employee.preferredOffDays.includes(weekdayOf(d))).length;
      }
      if (!picked.some(isWeekend)) weekendless++;
      cost += picked.filter((d) => holidays.has(d)).length * OFF_ON_HOLIDAY;
    });
    let stretch = 0;
    for (const d of horizon) {
      stretch = off.has(d) || block(employee, d) ? 0 : stretch + 1;
      if (stretch > MAX_STRETCH) cost += LONG_STRETCH;
    }
    return cost + MISSED_PREFERENCE * misses ** 2 + NO_WEEKEND_OFF * weekendless ** 2;
  }

  const workOf = new Map<number, Set<number>>();
  for (const a of assignments) workOf.set(a.employeeId, (workOf.get(a.employeeId) ?? new Set()).add(a.serviceId));
  const shareWork = (x: Plan, y: Plan) =>
    [...(workOf.get(x.employee.id) ?? [])].some((id) => workOf.get(y.employee.id)?.has(id));

  // ----- improve each group until nothing helps -----
  groups.forEach((group, groupIndex) => {
    const members = group.employees.map((e) => plans.get(e.id)!);
    const weekCount = members[0].weeks.length;
    // Start from each person's own best choice.
    for (const plan of members) {
      for (let w = 0; w < weekCount; w++) {
        plan.choice[w] = bestIndex(plan.weeks[w].options.map((_, o) => {
          plan.choice[w] = o;
          return personCost(plan);
        }));
      }
    }
    const off = new Map(members.map((p) => [p.employee.id, offDates(p)]));
    const weekCost = (w: number, changed: Plan[]) => {
      for (const p of changed) off.set(p.employee.id, offDates(p));
      return (
        members[0].weeks[w].dates.reduce((sum, d) => sum + dayCost(group, groupIndex, d, off), 0) +
        changed.reduce((sum, p) => sum + personCost(p), 0)
      );
    };

    for (let round = 0, improved = true; improved && round < 30; round++) {
      improved = false;
      for (let w = 0; w < weekCount; w++) {
        for (const plan of members) if (tryMoves(w, [plan])) improved = true;
      }
      if (improved) continue;
      // Stuck: try changing two people in the same week together.
      for (let w = 0; w < weekCount; w++) {
        for (let a = 0; a < members.length; a++) {
          for (let b = a + 1; b < members.length; b++) {
            // Only people who share some work can cover for each other.
            if (!shareWork(members[a], members[b])) continue;
            if (tryMoves(w, [members[a], members[b]])) improved = true;
          }
        }
      }
    }

    function tryMoves(w: number, who: Plan[]) {
      const start = who.map((p) => p.choice[w]);
      let bestCost = weekCost(w, who);
      let best = start;
      // Together, each person moves at most one day at a time. Trying every
      // combination grows far too fast with two or more weekly offs.
      const choices = who.map((p, i) => {
        const options = p.weeks[w].options;
        const near = (o: string[]) => o.filter((d) => !options[start[i]].includes(d)).length <= 1;
        return options.map((_, index) => index).filter((index) => who.length === 1 || near(options[index]));
      });
      for (const combo of product(choices)) {
        who.forEach((p, i) => (p.choice[w] = combo[i]));
        const cost = weekCost(w, who);
        if (cost < bestCost - 1e-9) [bestCost, best] = [cost, combo];
      }
      who.forEach((p, i) => (p.choice[w] = best[i]));
      weekCost(w, who); // refresh the off days
      return best !== start;
    }
  });

  // ----- write the roster -----
  const days: RosterDay[] = [];
  const backupDays = new Map<number, number>();
  const finalOff = new Map([...plans].map(([id, plan]) => [id, offDates(plan)]));
  for (const date of month) {
    for (const group of groups) {
      const working = new Set(
        group.employees.filter((e) => !block(e, date) && !finalOff.get(e.id)!.has(date)).map((e) => e.id),
      );
      const result = coverDay(
        problemFor(group, date, working, (id) => leadCost(id) + REPEAT_BACKUP * (backupDays.get(id) ?? 0)),
      );
      if (!result.exact) exact = false;
      for (const id of new Set(result.covers.filter((c) => c.isBackup).map((c) => c.employeeId))) {
        backupDays.set(id, (backupDays.get(id) ?? 0) + 1);
      }
      for (const employee of group.employees) {
        const duties = result.covers
          .filter((c) => c.employeeId === employee.id)
          .map(({ serviceId, isBackup }) => ({ serviceId, isBackup }))
          .sort((a, b) => a.serviceId - b.serviceId);
        let status: DayStatus = "working";
        const blocked = block(employee, date);
        if (finalOff.get(employee.id)!.has(date)) status = "weekly_off";
        else if (blocked) status = blocked;
        else if (holidays.has(date) && duties.length === 0) status = "holiday";
        days.push({ employeeId: employee.id, date, status, duties });
      }
    }
  }
  days.sort((a, b) => a.employeeId - b.employeeId || a.date.localeCompare(b.date));
  return { days, exact };
}

type Group = { employees: Employee[]; services: Service[]; assignments: RosterInput["assignments"] };

// People and services that are linked by assignments are planned together.
// Unlinked groups (usually pods) cannot affect each other, which keeps this fast.
function connectedGroups(employees: Employee[], services: Service[], assignments: RosterInput["assignments"]): Group[] {
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    const p = parent.get(x) ?? x;
    return p === x ? x : find(p);
  };
  for (const a of assignments) {
    const [x, y] = [find(`e${a.employeeId}`), find(`s${a.serviceId}`)];
    if (x !== y) parent.set(x, y);
  }
  const groups = new Map<string, Group>();
  for (const employee of employees) {
    const root = find(`e${employee.id}`);
    const group = groups.get(root) ?? { employees: [], services: [], assignments: [] };
    group.employees.push(employee);
    groups.set(root, group);
  }
  for (const s of services) groups.get(find(`s${s.id}`))?.services.push(s);
  const serviceIds = new Set(services.map((s) => s.id));
  for (const a of assignments) {
    if (serviceIds.has(a.serviceId)) groups.get(find(`e${a.employeeId}`))?.assignments.push(a);
  }
  return [...groups.values()];
}

function combinations<T>(items: T[], size: number): T[][] {
  if (size === 0) return [[]];
  return items.flatMap((item, i) => combinations(items.slice(i + 1), size - 1).map((rest) => [item, ...rest]));
}

function product(lists: number[][]): number[][] {
  return lists.reduce<number[][]>((all, list) => all.flatMap((head) => list.map((x) => [...head, x])), [[]]);
}

function bestIndex(costs: number[]) {
  return costs.indexOf(Math.min(...costs));
}
