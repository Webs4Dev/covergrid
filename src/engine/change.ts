// Handles change after a roster exists: what a change breaks, how to repair only the
// affected days, and which fixes the manager can choose from.
import { checkRoster, coverRules, type CheckInput, type Issue } from "./check.ts";
import { coverDay, type Candidate } from "./cover-day.ts";
import { addDays, monthDates, weekdayOf, weekOf } from "./dates.ts";
import { createDemand } from "./demand.ts";
import { connectedGroups } from "./generate.ts";
import type { Assignment, DayStatus, Duty, RosterDay, Service } from "./types.ts";

const NEW_BACKUP = 5; // keep the current backup unless changing really helps
const CALL_IN_HOLIDAY = 3;

// ---------- comparing ----------

const issueKey = (i: Issue) => [i.code, i.date, i.employeeIds.join(), i.serviceIds.join(), i.message].join("|");

export function diffIssues(before: Issue[], after: Issue[]) {
  const old = new Set(before.map(issueKey));
  const now = new Set(after.map(issueKey));
  return {
    added: after.filter((i) => !old.has(issueKey(i))),
    resolved: before.filter((i) => !now.has(issueKey(i))),
  };
}

const dayKey = (d: { employeeId: number; date: string }) => `${d.employeeId}|${d.date}`;
const sortDuties = (duties: Duty[]) => [...duties].sort((a, b) => a.serviceId - b.serviceId);
const sameDay = (a: RosterDay, b: RosterDay) =>
  a.status === b.status && Boolean(a.locked) === Boolean(b.locked) &&
  JSON.stringify(sortDuties(a.duties)) === JSON.stringify(sortDuties(b.duties));

export type DayChange = { before: RosterDay | null; after: RosterDay | null };

export function changedDays(before: RosterDay[], after: RosterDay[]): DayChange[] {
  const old = new Map(before.map((d) => [dayKey(d), d]));
  const now = new Map(after.map((d) => [dayKey(d), d]));
  return [...new Set([...old.keys(), ...now.keys()])]
    .map((key) => ({ before: old.get(key) ?? null, after: now.get(key) ?? null }))
    .filter(({ before: b, after: a }) => !a || !b || !sameDay(a, b))
    .sort((x, y) => {
      const [a, b] = [(x.after ?? x.before)!, (y.after ?? y.before)!];
      return a.date.localeCompare(b.date) || a.employeeId - b.employeeId;
    });
}

// ---------- repairing ----------

const byPersonThenDate = (a: RosterDay, b: RosterDay) => a.employeeId - b.employeeId || a.date.localeCompare(b.date);

export type DateRange = { startDate: string; endDate: string };

/**
 * Brings a roster in line with the current data and fills gaps with approved people.
 * Weekly offs are never moved and days without a problem are left exactly as they are.
 * A day the manager edited by hand keeps its duties, unless the person cannot work.
 * With a range, only those dates may change, so one change does not drag in others.
 */
export function repair(input: CheckInput, days: RosterDay[], range?: DateRange): RosterDay[] {
  if (!range) return repairMonth(input, days);
  const inside = (d: RosterDay) => d.date >= range.startDate && d.date <= range.endDate;
  return [...days.filter((d) => !inside(d)), ...repairMonth(input, days).filter(inside)].sort(byPersonThenDate);
}

// Each date is repaired on its own, which is why the result can be cut by date.
function repairMonth(input: CheckInput, days: RosterDay[]): RosterDay[] {
  const dates = monthDates(input.month);
  const demand = createDemand(input);
  const { cannotWork, counts } = coverRules(input);
  const holidays = new Set(input.holidays.map((h) => h.date));
  const services = new Map(input.services.map((s) => [s.id, s]));
  const roles = new Map(input.assignments.map((a) => [`${a.employeeId}|${a.serviceId}`, a.role]));
  const groups = connectedGroups(input.employees, input.services, input.assignments);
  const existing = new Map(days.map((d) => [dayKey(d), d]));
  const result = new Map<string, RosterDay>();

  for (const group of groups) {
    const dirty = new Set<string>();

    for (const e of group.employees) {
      for (const date of dates) {
        const found = existing.get(`${e.id}|${date}`);
        const day: RosterDay = found ?? { employeeId: e.id, date, status: newcomerStatus(e.id, date), duties: [] };
        const cannot = cannotWork(e.id, date);
        const booked = input.timeOff.filter(
          (t) => t.employeeId === e.id && t.status === "approved" && t.startDate <= date && date <= t.endDate,
        );
        let status: DayStatus = day.status;
        const isAway = status === "leave" || status === "comp_off" || status === "unavailable";
        if (cannot.length > 0 && (status === "working" || (isAway && !booked.some((t) => t.kind === status)))) {
          status = booked[0]?.kind ?? (e.fixedOffDays.includes(weekdayOf(date)) ? "weekly_off" : "unavailable");
        } else if (cannot.length === 0 && (isAway || (status === "holiday" && !holidays.has(date)))) {
          status = "working";
        }
        const duties = status !== "working" ? [] : day.duties.filter((x) => {
          const s = services.get(x.serviceId);
          return s && roles.has(`${e.id}|${s.id}`) && demand(s, date) > 0;
        });
        const next = { ...day, status, duties };
        if (!found || !sameDay(next, day)) dirty.add(date);
        result.set(dayKey(next), next);
      }
    }

    for (const date of dates) {
      const today = group.employees.map((e) => result.get(`${e.id}|${date}`)!);
      const short = group.services.some((s) => today.filter((d) => counts(d, s.id)).length < demand(s, date));
      if (!short && !dirty.has(date)) continue;

      const fixed = today.filter((d) => d.locked && d.status === "working");
      const free = today.filter((d) => !d.locked && (d.status === "working" || (d.status === "holiday" && cannotWork(d.employeeId, date).length === 0)));
      const candidates = new Map<number, Candidate[]>();
      for (const a of group.assignments) {
        if (!free.some((d) => d.employeeId === a.employeeId)) continue;
        candidates.set(a.serviceId, [...(candidates.get(a.serviceId) ?? []), { employeeId: a.employeeId, isBackup: a.role === "backup" }]);
      }
      const cover = coverDay({
        services: group.services.map((s) => ({
          id: s.id, brandId: s.brandId, shiftId: s.shiftId,
          need: Math.max(0, demand(s, date) - fixed.filter((d) => counts(d, s.id)).length),
        })),
        candidates,
        maxBrands: new Map(group.employees.map((e) => [e.id, e.maxBrandsPerDay])),
        extraCost: (id) => {
          const d = free.find((x) => x.employeeId === id);
          if (d?.status === "holiday") return NEW_BACKUP + CALL_IN_HOLIDAY;
          return d?.duties.some((x) => x.isBackup) ? 0 : NEW_BACKUP;
        },
      });
      for (const d of free) {
        const duties = sortDuties(
          cover.covers.filter((c) => c.employeeId === d.employeeId).map(({ serviceId, isBackup }) => ({ serviceId, isBackup })),
        );
        const status = duties.length > 0 ? "working" : d.status;
        result.set(dayKey(d), { ...d, status, duties });
      }
    }
  }
  return [...result.values()].sort(byPersonThenDate);

  // Someone added after the roster was made: their favourite days off, else the weekend.
  function newcomerStatus(employeeId: number, date: string): DayStatus {
    const e = input.employees.find((x) => x.id === employeeId)!;
    const weekday = weekdayOf(date);
    const order = [...new Set([...e.fixedOffDays, ...e.preferredOffDays, 0, 6, 5, 4, 3, 2, 1])];
    const count = Math.max(e.weeklyOffCount, e.fixedOffDays.length);
    return order.slice(0, count).includes(weekday) ? "weekly_off" : "working";
  }
}

// ---------- suggesting fixes ----------

export type Fix = {
  key: string;
  kind: "cover" | "swap" | "train";
  label: string;
  detail: string;
  days: RosterDay[]; // the whole roster with the fix applied
  newAssignment: Assignment | null;
};

const KEY = /^(cover|swap|train)\.(\d{1,9})\.(\d{4}-\d\d-\d\d)\.(\d{1,9})$/;

/** Ways to fill one place in a service on a date. None of them breaks another must-fix rule. */
export function suggestFixes(input: CheckInput, days: RosterDay[], service: Service, date: string): Fix[] {
  const { cannotWork, counts } = coverRules(input);
  const demand = createDemand(input);
  const dates = monthDates(input.month);
  const today = new Map(days.filter((d) => d.date === date).map((d) => [d.employeeId, d]));
  const have = [...today.values()].filter((d) => counts(d, service.id)).length;
  if (have >= demand(service, date)) return [];

  const before = checkRoster(input, days);
  const isThisGap = (i: Issue) =>
    (i.code === "no_cover" || i.code === "short_staffed") && i.date === date && i.serviceIds[0] === service.id;
  /** Null if the change breaks something, otherwise how many preference notes it adds. */
  const price = (using: CheckInput, next: RosterDay[]) => {
    // A smaller version of the same gap is progress, not a new problem.
    const added = diffIssues(before, checkRoster(using, next)).added;
    return added.some((i) => i.severity === "must_fix" && !isThisGap(i)) ? null : added.length;
  };
  const replace = (...changed: RosterDay[]) => {
    const map = new Map(changed.map((d) => [dayKey(d), d]));
    return days.map((d) => map.get(dayKey(d)) ?? d);
  };
  const services = new Map(input.services.map((s) => [s.id, s]));
  const roleOf = (id: number) => input.assignments.find((a) => a.employeeId === id && a.serviceId === service.id)?.role;
  const brandsOn = (day: RosterDay) => new Set(day.duties.map((d) => services.get(d.serviceId)?.brandId)).size;
  const fixes: (Fix & { rank: number })[] = [];
  const make = (kind: Fix["kind"], employeeId: number, label: string, detail: string, next: RosterDay[], rank: number, newAssignment: Assignment | null = null) =>
    fixes.push({ key: `${kind}.${service.id}.${date}.${employeeId}`, kind, label, detail, days: next, newAssignment, rank });

  for (const e of input.employees) {
    const day = today.get(e.id);
    const role = roleOf(e.id);
    if (!day || cannotWork(e.id, date).length > 0 || counts(day, service.id)) continue;
    const withDuty = (isBackup: boolean): RosterDay => ({
      ...day, status: "working", duties: sortDuties([...day.duties, { serviceId: service.id, isBackup }]), locked: true,
    });

    if (role && (day.status === "working" || day.status === "holiday")) {
      const next = replace(withDuty(role === "backup"));
      const cost = price(input, next);
      if (cost === null) continue;
      const load = brandsOn(day);
      make("cover", e.id, `${e.name} covers it`,
        day.status === "holiday"
          ? "Assigned to this work, but on a public holiday that day. Earns a comp-off."
          : `Assigned as ${role} and at work, with ${load} ${load === 1 ? "brand" : "brands"} that day so far.`,
        next, load + (day.status === "holiday" ? 20 : 0) + cost);
    } else if (role && day.status === "weekly_off" && !day.locked) {
      let best: { next: RosterDay[]; cost: number; other: string } | null = null;
      for (const other of weekOf(date)) {
        const then = days.find((d) => d.employeeId === e.id && d.date === other);
        if (other === date || !dates.includes(other) || then?.status !== "working") continue;
        const moved = replace(withDuty(role === "backup"), { ...then, status: "weekly_off", duties: [], locked: true });
        // Only the day given up needs new cover.
        const next = repair(input, moved, { startDate: other, endDate: other });
        if (!next.some((d) => d.employeeId === e.id && d.date === date && counts(d, service.id))) continue;
        const cost = price(input, next);
        if (cost !== null && (!best || cost < best.cost)) best = { next, cost, other };
      }
      if (best) {
        make("swap", e.id, `${e.name} works this day and takes ${best.other} off instead`,
          "Moves their weekly off inside the same week. Any work on the new day off is still covered.", best.next, 50 + best.cost);
      }
    } else if (!role && day.status === "working") {
      const podId = input.brands.find((b) => b.id === service.brandId)?.podId;
      if (e.podId !== podId) continue;
      const assignment: Assignment = { employeeId: e.id, serviceId: service.id, role: "backup" };
      const using = { ...input, assignments: [...input.assignments, assignment] };
      const next = replace(withDuty(true));
      const cost = price(using, next);
      if (cost === null) continue;
      const knowsBrand = input.assignments.some((a) => a.employeeId === e.id && services.get(a.serviceId)?.brandId === service.brandId);
      make("train", e.id, `Add ${e.name} as a new backup and have them cover it`,
        `${knowsBrand ? "Already works on this brand" : "Same pod"}, at work with ${brandsOn(day)} of ${e.maxBrandsPerDay} brands. Adds an assignment they do not have today, so agree on training first.`,
        next, 100 + (knowsBrand ? 0 : 10) + brandsOn(day), assignment);
    }
  }

  fixes.sort((a, b) => a.rank - b.rank || a.key.localeCompare(b.key));
  // Training is a last resort: at most three people, and only if nobody assigned can help.
  const ready = fixes.filter((f) => f.kind !== "train");
  const list = ready.length > 0 ? ready : fixes.slice(0, 3);
  return list.map(({ key, kind, label, detail, days: next, newAssignment }) => ({ key, kind, label, detail, days: next, newAssignment }));
}

/** Applies chosen fixes one after another, each checked again against the state so far. */
export function applyFixes(input: CheckInput, days: RosterDay[], keys: string[]) {
  let using = input;
  let current = days;
  const added: Assignment[] = [];
  const labels: string[] = [];
  for (const key of keys) {
    const match = KEY.exec(key);
    const service = match && using.services.find((s) => s.id === Number(match[2]));
    const fix = service && suggestFixes(using, current, service, match[3]).find((f) => f.key === key);
    if (!fix) return null; // the situation changed, or the key was made up
    current = fix.days;
    labels.push(fix.label);
    if (fix.newAssignment) {
      added.push(fix.newAssignment);
      using = { ...using, assignments: [...using.assignments, fix.newAssignment] };
    }
  }
  return { input: using, days: current, newAssignments: added, labels };
}

// ---------- describing a change ----------

export type Plan = {
  added: Issue[];
  resolved: Issue[];
  changes: DayChange[];
  gaps: { issue: Issue; fixes: Fix[] }[];
};

/** Everything the manager should see before saving a change. */
export function describeChange(
  before: { input: CheckInput; days: RosterDay[] },
  after: { input: CheckInput; days: RosterDay[] },
): Plan {
  const { added, resolved } = diffIssues(checkRoster(before.input, before.days), checkRoster(after.input, after.days));
  const gaps = added
    .filter((i) => i.code === "no_cover" || i.code === "short_staffed")
    .map((issue) => {
      const service = after.input.services.find((s) => s.id === issue.serviceIds[0])!;
      return { issue, fixes: suggestFixes(after.input, after.days, service, issue.date!) };
    });
  return { added, resolved, changes: changedDays(before.days, after.days), gaps };
}

/** Nearby dates when the same leave would cause no new must-fix problem. */
export function otherLeaveDates(input: CheckInput, days: RosterDay[], leave: { employeeId: number; kind: "leave" | "comp_off" | "unavailable"; startDate: string; endDate: string }) {
  const dates = monthDates(input.month);
  const last = dates[dates.length - 1];
  const now = checkRoster(input, days);
  const shifts = [1, -1, 2, -2, 3, -3, 4, -4, 5, -5, 6, -6, 7, -7];
  const found: { startDate: string; endDate: string }[] = [];
  for (const shift of shifts) {
    const startDate = addDays(leave.startDate, shift);
    const endDate = addDays(leave.endDate, shift);
    if (startDate < dates[0] || endDate > last) continue;
    const working = days.filter((d) => d.employeeId === leave.employeeId && d.date >= startDate && d.date <= endDate);
    if (!working.some((d) => d.status === "working")) continue; // already off then
    const using = { ...input, timeOff: [...input.timeOff, { ...leave, status: "approved" as const, startDate, endDate }] };
    const { added } = diffIssues(now, checkRoster(using, repair(using, days, { startDate, endDate })));
    if (!added.some((i) => i.severity === "must_fix")) found.push({ startDate, endDate });
    if (found.length === 3) break;
  }
  return found;
}
