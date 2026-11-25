import { addDays, monthDates, weekdayOf, weekOf } from "./dates.ts";
import { createDemand } from "./demand.ts";
import type { DayStatus, RosterDay, RosterInput, Service } from "./types.ts";

// Finds every problem in a roster, however it was made (generated or hand-edited).
// It shares only the date and demand facts with the roster maker, never its
// decisions, so a mistake in the maker cannot hide itself here.
//
// must_fix   = breaks a mandatory rule, blocks normal publishing
// preference = allowed, but somebody should know

export type CheckInput = RosterInput & {
  processes: { id: number; code: string }[];
  shifts: { id: number; name: string }[];
  compOffCredits: { employeeId: number; earnedOn: string }[];
};

export type IssueCode =
  | "no_cover"
  | "short_staffed"
  | "gaps_across_brands"
  | "working_when_away"
  | "duty_when_off"
  | "shift_clash"
  | "too_many_brands"
  | "not_assigned"
  | "missing_day"
  | "duplicate_day"
  | "unknown_employee"
  | "unknown_service"
  | "too_few_weekly_offs"
  | "comp_off_not_earned"
  | "extra_weekly_offs"
  | "status_mismatch"
  | "closed_service"
  | "preferred_off_missed"
  | "long_stretch";

export type Issue = {
  code: IssueCode;
  severity: "must_fix" | "preference";
  date: string | null;
  employeeIds: number[];
  serviceIds: number[];
  message: string; // what is wrong
  reasons: string[]; // why
};

const MAX_STRETCH = 7;
const STATUS_TEXT: Record<DayStatus, string> = {
  working: "working",
  weekly_off: "on weekly off",
  holiday: "on holiday",
  leave: "on leave",
  comp_off: "on comp-off",
  unavailable: "unavailable",
};
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const PREFERENCE_CODES = new Set<IssueCode>([
  "extra_weekly_offs", "status_mismatch", "closed_service", "preferred_off_missed", "long_stretch",
]);

export const canPublish = (issues: Issue[]) => !issues.some((i) => i.severity === "must_fix");

/**
 * When someone cannot work, and whether a roster day really covers a service.
 * Shared with the roster screens so they always agree with the checker.
 */
export function coverRules(input: CheckInput) {
  const employees = new Map(input.employees.map((e) => [e.id, e]));
  const assigned = new Set(input.assignments.map((a) => `${a.employeeId}|${a.serviceId}`));

  /** Time off or a weekday that makes working impossible, whatever the roster says. */
  const cannotWork = (employeeId: number, date: string) => {
    const e = employees.get(employeeId);
    if (!e) return [];
    const weekday = weekdayOf(date);
    const why = input.timeOff
      .filter((t) => t.employeeId === employeeId && t.status === "approved" && t.startDate <= date && date <= t.endDate)
      .map((t) => `${e.name} has approved time off (${STATUS_TEXT[t.kind]}).`);
    if (e.fixedOffDays.includes(weekday)) why.push(`${e.name} always has ${WEEKDAYS[weekday]} off.`);
    if (e.unavailableDays.includes(weekday)) why.push(`${e.name} cannot work on ${WEEKDAYS[weekday]}s.`);
    return why;
  };

  // Someone who cannot work is never cover, even if the roster has not caught up.
  const counts = (day: RosterDay, serviceId: number) =>
    day.status === "working" && employees.has(day.employeeId) && cannotWork(day.employeeId, day.date).length === 0 &&
    assigned.has(`${day.employeeId}|${serviceId}`) && day.duties.some((d) => d.serviceId === serviceId);

  return { cannotWork, counts };
}

export function checkRoster(input: CheckInput, days: RosterDay[]): Issue[] {
  const issues: Issue[] = [];
  const add = (
    code: IssueCode,
    message: string,
    at: { date?: string; employeeIds?: number[]; serviceIds?: number[]; reasons?: string[] } = {},
  ) =>
    issues.push({
      code, message,
      severity: PREFERENCE_CODES.has(code) ? "preference" : "must_fix",
      date: at.date ?? null,
      employeeIds: at.employeeIds ?? [],
      serviceIds: at.serviceIds ?? [],
      reasons: at.reasons ?? [],
    });

  const dates = monthDates(input.month);
  const [first, last] = [dates[0], dates[dates.length - 1]];
  const demand = createDemand(input);
  const employees = new Map(input.employees.map((e) => [e.id, e]));
  const services = new Map(input.services.map((s) => [s.id, s]));
  const brandName = new Map(input.brands.map((b) => [b.id, b.name]));
  const processCode = new Map(input.processes.map((p) => [p.id, p.code]));
  const shiftName = new Map(input.shifts.map((s) => [s.id, s.name]));
  const brandOf = (s: Service) => brandName.get(s.brandId) ?? `Brand ${s.brandId}`;
  const label = (s: Service) => `${brandOf(s)} ${processCode.get(s.processId) ?? ""}`.trim();
  const assigned = new Map(input.assignments.map((a) => [`${a.employeeId}|${a.serviceId}`, a.role]));

  const byDay = new Map<string, RosterDay>();
  for (const day of days) {
    const key = `${day.employeeId}|${day.date}`;
    const name = employees.get(day.employeeId)?.name;
    if (!name) {
      add("unknown_employee", `The roster includes someone who is no longer active (ID ${day.employeeId}).`, { date: day.date, employeeIds: [day.employeeId] });
    } else if (byDay.has(key)) {
      add("duplicate_day", `${name} appears twice on this day.`, { date: day.date, employeeIds: [day.employeeId] });
    }
    byDay.set(key, day);
  }

  const timeOffOn = (employeeId: number, date: string) =>
    input.timeOff.filter(
      (t) => t.employeeId === employeeId && t.status === "approved" && t.startDate <= date && date <= t.endDate,
    );

  const { cannotWork, counts } = coverRules(input);

  // ---------- each person, each day ----------
  for (const e of input.employees) {
    for (const date of dates) {
      const day = byDay.get(`${e.id}|${date}`);
      const at = { date, employeeIds: [e.id] };
      if (!day) {
        add("missing_day", `${e.name} has no plan for this day.`, at);
        continue;
      }
      const away = timeOffOn(e.id, date);
      const working = day.status === "working";

      if (working) {
        const why = cannotWork(e.id, date);
        if (why.length > 0) add("working_when_away", `${e.name} is set to work on a day they cannot.`, { ...at, reasons: why });
      } else if (away.length > 0 && !away.some((t) => t.kind === day.status)) {
        add("status_mismatch", `${e.name} is shown ${STATUS_TEXT[day.status]}, but the approved entry says ${STATUS_TEXT[away[0].kind]}.`, at);
      } else if ((day.status === "leave" || day.status === "comp_off") && away.length === 0) {
        add("status_mismatch", `${e.name} is shown ${STATUS_TEXT[day.status]} without an approved entry.`, at);
      } else if (day.status === "holiday" && !input.holidays.some((h) => h.date === date)) {
        add("status_mismatch", `${e.name} is shown on holiday, but this is not a public holiday.`, at);
      }
      if (!working && day.duties.length > 0) {
        add("duty_when_off", `${e.name} is ${STATUS_TEXT[day.status]} but still has work to cover.`, { ...at, serviceIds: day.duties.map((d) => d.serviceId) });
      }

      const mine: Service[] = [];
      for (const duty of day.duties) {
        const s = services.get(duty.serviceId);
        if (!s) {
          add("unknown_service", `${e.name} covers work that is no longer active (ID ${duty.serviceId}).`, { ...at, serviceIds: [duty.serviceId] });
          continue;
        }
        mine.push(s);
        if (!assigned.has(`${e.id}|${s.id}`)) {
          add("not_assigned", `${e.name} covers ${label(s)} but is neither a primary nor a backup for it.`, { ...at, serviceIds: [s.id] });
        }
        if (demand(s, date) === 0) {
          add("closed_service", `${e.name} covers ${label(s)}, which needs nobody on this day.`, { ...at, serviceIds: [s.id] });
        }
      }
      const shifts = [...new Set(mine.map((s) => s.shiftId))];
      if (shifts.length > 1) {
        add("shift_clash", `${e.name} has work in ${shifts.length} different shifts on one day.`, {
          ...at, serviceIds: mine.map((s) => s.id), reasons: mine.map((s) => `${label(s)} runs in the ${shiftName.get(s.shiftId) ?? "unknown"} shift.`),
        });
      }
      const brands = [...new Set(mine.map(brandOf))];
      if (brands.length > e.maxBrandsPerDay) {
        add("too_many_brands", `${e.name} covers ${brands.length} brands; the limit is ${e.maxBrandsPerDay}.`, { ...at, serviceIds: mine.map((s) => s.id), reasons: [`Brands: ${brands.join(", ")}.`] });
      }
    }
  }

  // ---------- each service, each day ----------
  const onDate = new Map<string, RosterDay[]>();
  for (const day of byDay.values()) onDate.set(day.date, [...(onDate.get(day.date) ?? []), day]);

  for (const date of dates) {
    const short: Service[] = [];
    for (const s of input.services) {
      const need = demand(s, date);
      const have = (onDate.get(date) ?? []).filter((d) => counts(d, s.id)).length;
      if (have >= need) continue;
      short.push(s);
      const able = input.assignments.filter((a) => a.serviceId === s.id && employees.has(a.employeeId));
      const reasons: string[] = [];
      if (able.length === 0) reasons.push(`Nobody is assigned to ${label(s)}.`);
      else if (able.length < need) {
        reasons.push(`Impossible with the current team: ${need} needed, but only ${able.length} ${able.length === 1 ? "person is" : "people are"} assigned to this work.`);
      }
      for (const a of able) {
        const reason = whyNot(a.employeeId, s, date);
        if (reason) reasons.push(reason);
      }
      const people = need === 1 ? "person" : "people";
      add(
        have === 0 ? "no_cover" : "short_staffed",
        have === 0 ? `${label(s)} has nobody; ${need} ${people} needed.` : `${label(s)} has ${have} of the ${need} ${people} needed.`,
        { date, employeeIds: able.map((a) => a.employeeId), serviceIds: [s.id], reasons },
      );
    }
    // One person's absence that hurts several brands.
    for (const e of input.employees) {
      const status = byDay.get(`${e.id}|${date}`)?.status;
      if (!status) continue;
      const blocked = cannotWork(e.id, date).length > 0;
      if (status === "working" && !blocked) continue;
      const hit = short.filter((s) => assigned.get(`${e.id}|${s.id}`) === "primary");
      const brands = [...new Set(hit.map(brandOf))];
      if (brands.length > 1) {
        add("gaps_across_brands", `${e.name} is ${status === "working" ? "not able to work" : STATUS_TEXT[status]}, which leaves gaps in ${brands.length} brands.`, { date, employeeIds: [e.id], serviceIds: hit.map((s) => s.id), reasons: [`Brands: ${brands.join(", ")}.`] });
      }
    }
  }

  function whyNot(employeeId: number, s: Service, date: string): string | null {
    const e = employees.get(employeeId)!;
    const day = byDay.get(`${employeeId}|${date}`);
    if (!day) return `${e.name} has no plan for this day.`;
    if (counts(day, s.id)) return null;
    if (day.status !== "working") return `${e.name} is ${STATUS_TEXT[day.status]}.`;
    const blocked = cannotWork(employeeId, date);
    if (blocked.length > 0) return blocked[0];
    const mine = day.duties.flatMap((d) => services.get(d.serviceId) ?? []);
    const other = mine.find((x) => x.shiftId !== s.shiftId);
    if (other) return `${e.name} works the ${shiftName.get(other.shiftId) ?? "other"} shift that day (${label(other)}).`;
    const brands = new Set(mine.map((x) => x.brandId));
    if (!brands.has(s.brandId) && brands.size >= e.maxBrandsPerDay) {
      return `${e.name} already covers ${brands.size} ${brands.size === 1 ? "brand" : "brands"}, their daily limit.`;
    }
    return `${e.name} is at work and could take this.`;
  }

  // ---------- each person, each week ----------
  for (const e of input.employees) {
    const statusOn = (date: string) => byDay.get(`${e.id}|${date}`)?.status;
    for (let monday = weekOf(first)[0]; monday <= last; monday = addDays(monday, 7)) {
      const week = weekOf(monday);
      const inMonth = week.filter((d) => d >= first && d <= last);
      const before = (input.history ?? []).filter((h) => h.employeeId === e.id && week.includes(h.date) && h.date < first);
      const offs = inMonth.filter((d) => statusOn(d) === "weekly_off").length;
      const offsBefore = before.filter((h) => h.status === "weekly_off").length;
      const daysAfter = week.filter((d) => d > last).length;
      // Without an earlier roster, a first part-week owes only its share.
      const owed =
        week[0] < first && before.length === 0
          ? Math.round((e.weeklyOffCount * week.filter((d) => d >= first).length) / 7)
          : e.weeklyOffCount - offsBefore;
      // Days already spent on leave or comp-off cannot also be weekly offs.
      const bookable = inMonth.filter((d) => !timeOffOn(e.id, d).some((t) => t.kind !== "unavailable")).length;
      const mustBeHere = Math.min(bookable, Math.max(0, owed - daysAfter));
      const when = `the week of ${monday}`;
      if (offs < mustBeHere) {
        add("too_few_weekly_offs", `${e.name} has ${offs} of ${mustBeHere} weekly offs due in ${when}.`, { date: inMonth[0], employeeIds: [e.id] });
      }
      const fixed = inMonth.filter((d) => statusOn(d) === "weekly_off" && e.fixedOffDays.includes(weekdayOf(d))).length;
      if (offs > Math.max(owed, fixed)) {
        add("extra_weekly_offs", `${e.name} has ${offs} weekly offs in ${when}; ${Math.max(0, owed)} agreed.`, { date: inMonth[0], employeeIds: [e.id] });
      }
    }

    if (e.preferredOffDays.length > 0) {
      const missed = dates.filter((d) => {
        const w = weekdayOf(d);
        return statusOn(d) === "weekly_off" && !e.preferredOffDays.includes(w) && !e.fixedOffDays.includes(w);
      });
      if (missed.length > 0) {
        add("preferred_off_missed", `${e.name} prefers ${e.preferredOffDays.map((d) => WEEKDAYS[d]).join(" or ")} off, but has ${missed.length} on other days.`, { employeeIds: [e.id], reasons: [`Dates: ${missed.join(", ")}.`] });
      }
    }

    let start = 0;
    for (let i = 0; i <= dates.length; i++) {
      if (i < dates.length && statusOn(dates[i]) === "working") continue;
      if (i - start > MAX_STRETCH) {
        add("long_stretch", `${e.name} works ${i - start} days in a row.`, { date: dates[start], employeeIds: [e.id], reasons: [`From ${dates[start]} to ${dates[i - 1]}.`] });
      }
      start = i + 1;
    }

    // Comp-offs must be earned before they are taken.
    const taken = input.timeOff
      .filter((t) => t.employeeId === e.id && t.kind === "comp_off" && t.status === "approved")
      .map((t) => t.startDate)
      .sort();
    taken.forEach((date, i) => {
      if (date < first || date > last) return;
      const earned = input.compOffCredits.filter((c) => c.employeeId === e.id && c.earnedOn < date).length;
      if (earned <= i) {
        add("comp_off_not_earned", `${e.name} has a comp-off without an earned credit.`, { date, employeeIds: [e.id], reasons: [`${earned} earned before this date, ${i + 1} taken.`] });
      }
    });
  }

  return issues.sort(
    (a, b) =>
      Number(a.severity === "preference") - Number(b.severity === "preference") ||
      (a.date ?? "9999").localeCompare(b.date ?? "9999") ||
      a.code.localeCompare(b.code),
  );
}
