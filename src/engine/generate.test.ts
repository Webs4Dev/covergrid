import { describe, expect, it } from "vitest";
import * as data from "../seed/data";
import { sampleInput } from "../seed/roster-input";
import { addDays, monthDates, weekdayOf, weekOf } from "./dates";
import { createDemand } from "./demand";
import { generateRoster } from "./generate";
import type { Employee, RosterDay, RosterInput, TimeOff } from "./types";

function gapsOf(input: RosterInput, days: RosterDay[]) {
  const demand = createDemand(input);
  return monthDates(input.month).flatMap((date) =>
    input.services.flatMap((s) => {
      const have = days.filter((d) => d.date === date && d.duties.some((x) => x.serviceId === s.id)).length;
      const missing = demand(s, date) - have;
      return missing > 0 ? [{ date, serviceId: s.id, missing }] : [];
    }),
  );
}

// Every must-have rule, checked without using the generator's own code.
function expectMustHaves(input: RosterInput, days: RosterDay[]) {
  const dates = monthDates(input.month);
  const demand = createDemand(input);
  expect(days).toHaveLength(input.employees.length * dates.length);
  for (const e of input.employees) {
    for (const date of dates) {
      const mine = days.filter((d) => d.employeeId === e.id && d.date === date);
      expect(mine).toHaveLength(1);
      const [day] = mine;
      const where = `${e.name} ${date}`;
      const away = input.timeOff.some(
        (t) => t.employeeId === e.id && t.status === "approved" && t.startDate <= date && date <= t.endDate,
      );
      const cannotWork = e.unavailableDays.includes(weekdayOf(date)) || e.fixedOffDays.includes(weekdayOf(date));
      if (away || cannotWork) expect(day.status, where).not.toBe("working");
      if (day.status !== "working") expect(day.duties, where).toEqual([]);
      const services = day.duties.map((x) => input.services.find((s) => s.id === x.serviceId)!);
      expect(new Set(services.map((s) => s.shiftId)).size, where).toBeLessThanOrEqual(1);
      expect(new Set(services.map((s) => s.brandId)).size, where).toBeLessThanOrEqual(e.maxBrandsPerDay);
      for (const duty of day.duties) {
        const a = input.assignments.find((x) => x.employeeId === e.id && x.serviceId === duty.serviceId);
        expect(a?.role, where).toBe(duty.isBackup ? "backup" : "primary");
        expect(demand(services.find((s) => s.id === duty.serviceId)!, date), where).toBeGreaterThan(0);
      }
    }
    // Weeks that lie fully inside the month have exactly the agreed number of offs.
    for (const monday of dates.filter((d) => weekdayOf(d) === 1)) {
      const week = weekOf(monday);
      if (!dates.includes(week[6])) continue;
      const mine = days.filter((d) => d.employeeId === e.id && week.includes(d.date));
      const bookable = mine.filter((d) => d.status !== "leave" && d.status !== "comp_off").length;
      const offs = mine.filter((d) => d.status === "weekly_off").length;
      const fixed = mine.filter((d) => e.fixedOffDays.includes(weekdayOf(d.date)) && d.status === "weekly_off").length;
      expect(offs, `${e.name} week of ${monday}`).toBe(Math.min(bookable, Math.max(e.weeklyOffCount, fixed)));
    }
  }
}

const december = sampleInput("2026-12");
const idOf = (name: string) => data.employees.find((e) => e.name === name)!.id;
const serviceOf = (brand: string, code: string) =>
  data.services.find((s) => data.brands[s.brandId - 1].name === brand && data.processes[s.processId - 1].code === code)!.id;

describe("sample month", () => {
  const { days, exact } = generateRoster(december);
  const dayOf = (name: string, date: string) => days.find((d) => d.employeeId === idOf(name) && d.date === date)!;

  it("keeps every must-have rule", () => expectMustHaves(december, days));

  it("has only the one gap that is impossible to fill", () => {
    expect(exact).toBe(true);
    expect(gapsOf(december, days)).toEqual([{ date: "2026-12-25", serviceId: serviceOf("Trailhoof", "CS"), missing: 1 }]);
  });

  it("gives the same answer every time", () => expect(generateRoster(december).days).toEqual(days));

  it("meets the two-person Saturday rule", () => {
    for (const saturday of ["05", "12", "19", "26"]) {
      const onDuty = days.filter((d) => d.date === `2026-12-${saturday}` && d.duties.some((x) => x.serviceId === serviceOf("Trailhoof", "CS")));
      expect(onDuty.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("uses a backup on the weekday a primary can never work", () => {
    expect(dayOf("Yash Thakur", "2026-12-02").status).not.toBe("working");
    const cover = days.filter((d) => d.date === "2026-12-02" && d.duties.some((x) => x.serviceId === serviceOf("Sprocketly", "CS")));
    expect(cover.map((d) => d.duties.every((x) => x.isBackup))).toEqual([true]);
  });

  it("follows date rules that open or close a service", () => {
    const on = (date: string, s: number) => days.filter((d) => d.date === date && d.duties.some((x) => x.serviceId === s)).length;
    expect(on("2026-12-25", serviceOf("Brewmint", "CS"))).toBe(1);
    expect(on("2026-12-31", serviceOf("Grainghar", "ACC"))).toBe(0);
    expect(on("2026-12-31", serviceOf("Grainghar", "CS"))).toBe(1);
  });

  it("ignores leave that is only requested or rejected", () => {
    expect(dayOf("Priya Nair", "2026-12-14").status).toBe("working");
    expect(dayOf("Neha Patil", "2026-12-31").status).toBe("working");
  });
});

describe("changes", () => {
  it("leaves only NDR uncovered when Priya's leave is approved", () => {
    const input: RosterInput = {
      ...december,
      timeOff: december.timeOff.map((t) => (t.employeeId === idOf("Priya Nair") ? { ...t, status: "approved" } : t)),
    };
    const { days } = generateRoster(input);
    expectMustHaves(input, days);
    expect(gapsOf(input, days).filter((g) => g.date === "2026-12-14")).toEqual([
      { date: "2026-12-14", serviceId: serviceOf("Glowleaf", "NDR"), missing: 1 },
    ]);
  });

  it("keeps every must-have with random leave in random months", () => {
    let seed = 11;
    const random = (n: number) => (seed = (seed * 1103515245 + 12345) % 2147483648) % n;
    for (const month of ["2026-11", "2027-01", "2027-02", "2027-05", "2028-02"]) {
      const dates = monthDates(month);
      const timeOff = Array.from({ length: 25 }, (): TimeOff => {
        const start = dates[random(dates.length)];
        return {
          employeeId: 1 + random(32), kind: random(2) ? "leave" : "unavailable", status: "approved",
          startDate: start, endDate: addDays(start, random(6)),
        };
      });
      const input = { ...sampleInput(month), timeOff };
      expectMustHaves(input, generateRoster(input).days);
    }
  }, 60_000);
});

describe("weeks shared by two months", () => {
  it("counts the week once when the earlier roster is known", () => {
    const history = generateRoster(december).days.filter((d) => d.date >= "2026-12-28");
    const input = { ...sampleInput("2027-01"), history };
    const days = [...history, ...generateRoster(input).days];
    const week = weekOf("2027-01-01");
    for (const e of data.employees) {
      const offs = days.filter((d) => d.employeeId === e.id && week.includes(d.date) && d.status === "weekly_off");
      expect(offs.length, e.name).toBe(1);
    }
  });
});

describe("small cases compared with trying every choice", () => {
  const person = (id: number, extra: Partial<Employee> = {}): Employee => ({
    id, name: `P${id}`, podId: 1, weeklyOffCount: 1, fixedOffDays: [], unavailableDays: [],
    preferredOffDays: [], maxBrandsPerDay: 2, ...extra,
  });
  // February 2027 is exactly four Monday-Sunday weeks, and weeks do not affect each other's coverage.
  const base: RosterInput = {
    month: "2027-02", pods: [{ id: 1, leadId: null }], employees: [], services: [], assignments: [],
    brands: [1, 2, 3].map((id) => ({ id, name: `B${id}`, podId: 1, calendarId: 1 })),
    calendars: [{ id: 1, name: "All", openDays: [0, 1, 2, 3, 4, 5, 6], openOnHolidays: true }],
    holidays: [], staffingRules: [], timeOff: [],
  };

  it("finds the fewest possible gaps", () => {
    let seed = 3;
    const random = (n: number) => (seed = (seed * 1103515245 + 12345) % 2147483648) % n;
    for (let run = 0; run < 25; run++) {
      const employees = [1, 2, 3].map((id) => person(id, { maxBrandsPerDay: 1 + random(2), preferredOffDays: [random(7)] }));
      const services = [1, 2, 3].map((id) => ({ id, brandId: id, processId: id, calendarId: null, shiftId: 1, minStaff: 1 + random(2) }));
      const assignments = employees.flatMap((e) =>
        services.filter((s) => s.id === e.id || random(2)).map((s) => ({
          employeeId: e.id, serviceId: s.id, role: s.id === e.id ? ("primary" as const) : ("backup" as const),
        })),
      );
      const staffingRules = [{ serviceId: 1, weekday: random(7), date: null, minStaff: 2 }];
      const input = { ...base, employees, services, assignments, staffingRules };
      const count = (days: RosterDay[]) => gapsOf(input, days).reduce((n, g) => n + g.missing, 0);
      const mine = count(generateRoster(input).days);

      // Force each of the 343 ways to place the three weekly offs.
      let fewest = Infinity;
      for (let i = 0; i < 343; i++) {
        const offs = [i % 7, Math.floor(i / 7) % 7, Math.floor(i / 49)];
        const forced = { ...input, employees: employees.map((e, k) => ({ ...e, fixedOffDays: [offs[k]] })) };
        fewest = Math.min(fewest, count(generateRoster(forced).days));
      }
      expect({ run, gaps: mine }).toEqual({ run, gaps: fewest });
    }
  }, 120_000);

  it("puts coverage before preferences, and shares the misses fairly", () => {
    const employees = [person(1, { preferredOffDays: [0] }), person(2, { preferredOffDays: [0] })];
    const services = [{ id: 1, brandId: 1, processId: 1, calendarId: null, shiftId: 1, minStaff: 1 }];
    const assignments = employees.map((e) => ({ employeeId: e.id, serviceId: 1, role: "primary" as const }));
    const input = { ...base, employees, services, assignments };
    const { days } = generateRoster(input);
    const sundays = employees.map((e) => days.filter((d) => d.employeeId === e.id && d.status === "weekly_off" && weekdayOf(d.date) === 0).length);
    expect(gapsOf(input, days)).toEqual([]);
    expect(sundays).toEqual([2, 2]);
  });

  it("handles people without work, and an empty company", () => {
    expect(generateRoster({ ...base, employees: [person(1)] }).days).toHaveLength(28);
    expect(generateRoster(base).days).toEqual([]);
  });
});

describe("size", () => {
  it("plans a company twice as big in a few seconds", () => {
    const copy = <T extends object>(list: T[], keys: (keyof T)[], by: number) =>
      [...list, ...list.map((x) => ({ ...x, ...Object.fromEntries(keys.map((k) => [k, x[k] === null ? null : Number(x[k]) + by])) }))];
    const input: RosterInput = {
      ...december,
      employees: copy(december.employees, ["id", "podId"], 100),
      pods: copy(december.pods, ["id", "leadId"], 100),
      brands: copy(december.brands, ["id", "podId"], 100),
      services: copy(december.services, ["id", "brandId"], 100),
      assignments: copy(december.assignments, ["employeeId", "serviceId"], 100),
    };
    const started = performance.now();
    const { days } = generateRoster(input);
    expect(days).toHaveLength(64 * 31);
    expect(performance.now() - started).toBeLessThan(10_000);
  }, 30_000);
});
