import { describe, expect, it } from "vitest";
import * as data from "../seed/data";
import { sampleInput } from "../seed/roster-input";
import { applyFixes, changedDays, describeChange, diffIssues, otherLeaveDates, repair, suggestFixes } from "./change";
import { checkRoster, type CheckInput } from "./check";
import { addDays, monthDates } from "./dates";
import { generateRoster } from "./generate";
import type { RosterDay, TimeOff } from "./types";

const input = sampleInput("2026-12");
const days = generateRoster(input).days;
const idOf = (name: string) => data.employees.find((e) => e.name === name)!.id;
const service = (brand: string, code: string) =>
  data.services.find((s) => data.brands[s.brandId - 1].name === brand && data.processes[s.processId - 1].code === code)!;
const leave = (name: string, from: string, to = from): TimeOff => ({ employeeId: idOf(name), kind: "leave", status: "approved", startDate: from, endDate: to });
const withLeave = (...entries: TimeOff[]): CheckInput => ({ ...input, timeOff: [...input.timeOff, ...entries] });
const mustFix = (using: CheckInput, d: RosterDay[]) => checkRoster(using, d).filter((i) => i.severity === "must_fix");
const newMustFix = (using: CheckInput, d: RosterDay[]) => diffIssues(checkRoster(input, days), mustFix(using, d)).added;

describe("repair", () => {
  it("changes nothing when nothing changed", () => {
    expect(changedDays(days, repair(input, days))).toEqual([]);
  });

  it("covers Priya's CS with an approved backup, touches only the 14th, and leaves NDR open", () => {
    const using = withLeave(leave("Priya Nair", "2026-12-14"));
    const fixed = repair(using, days);
    const changes = changedDays(days, fixed);
    expect(new Set(changes.map((c) => c.after!.date))).toEqual(new Set(["2026-12-14"]));
    expect(changes).toHaveLength(2); // Priya and one backup
    expect(newMustFix(using, fixed).map((i) => i.serviceIds)).toEqual([[service("Glowleaf", "NDR").id]]);
  });

  it("keeps a two-person brand covered when one is away", () => {
    const using = withLeave(leave("Lakshmi Krishnan", "2026-12-23", "2026-12-24"));
    expect(newMustFix(using, repair(using, days))).toEqual([]);
  });

  it("undoes itself when the leave is cancelled", () => {
    const using = withLeave(leave("Arjun Rao", "2026-12-15", "2026-12-16"));
    const back = repair(input, repair(using, days));
    expect(mustFix(input, back)).toEqual(mustFix(input, days));
    expect(changedDays(days, back)).toEqual([]);
  });

  it("handles a new brand requirement", () => {
    const rule = { serviceId: service("Cloudcrib", "CS").id, weekday: null, date: "2026-12-16", minStaff: 2 };
    const using = { ...input, staffingRules: [...input.staffingRules, rule] };
    const fixed = repair(using, days);
    expect(newMustFix(using, fixed)).toEqual([]);
    expect(changedDays(days, fixed)).toHaveLength(1);
  });

  it("calls in someone on holiday when a brand opens on that day", () => {
    const rule = { serviceId: service("Stridewell", "CS").id, weekday: null, date: "2026-12-25", minStaff: 1 };
    const using = { ...input, staffingRules: [...input.staffingRules, rule] };
    expect(newMustFix(using, repair(using, days))).toEqual([]);
  });

  it("plans a new employee and drops someone switched off", () => {
    const newcomer = { ...input.employees[0], id: 500, name: "New Person" };
    const added = { ...input, employees: [...input.employees, newcomer] };
    expect(newMustFix(added, repair(added, days))).toEqual([]);
    const without = { ...input, employees: input.employees.filter((e) => e.id !== idOf("Rohit Bansal")), assignments: input.assignments.filter((a) => a.employeeId !== idOf("Rohit Bansal")) };
    const fixed = repair(without, days);
    expect(fixed.some((d) => d.employeeId === idOf("Rohit Bansal"))).toBe(false);
    expect(mustFix(without, fixed).some((i) => i.code === "unknown_employee")).toBe(false);
  });

  it("keeps hand-edited days, unless the person cannot work", () => {
    const locked = days.map((d) => (d.employeeId === idOf("Kabir Anand") && d.date === "2026-12-14" ? { ...d, duties: [], locked: true } : d));
    const using = withLeave(leave("Priya Nair", "2026-12-14"));
    const fixed = repair(using, locked);
    expect(fixed.find((d) => d.employeeId === idOf("Kabir Anand") && d.date === "2026-12-14")!.duties).toEqual([]);
    const away = withLeave(leave("Kabir Anand", "2026-12-14"));
    expect(repair(away, locked).find((d) => d.employeeId === idOf("Kabir Anand") && d.date === "2026-12-14")!.status).toBe("leave");
  });

  it("never breaks a personal rule and only adds coverage gaps, with random leave", () => {
    let seed = 5;
    const random = (n: number) => (seed = (seed * 1103515245 + 12345) % 2147483648) % n;
    const dates = monthDates(input.month);
    for (let run = 0; run < 40; run++) {
      const entries = Array.from({ length: 1 + random(6) }, () => {
        const start = dates[random(dates.length)];
        return { ...leave("Priya Nair", start, addDays(start, random(5))), employeeId: 1 + random(32) };
      });
      const using = withLeave(...entries);
      const fixed = repair(using, days);
      const codes = new Set(newMustFix(using, fixed).map((i) => i.code));
      for (const code of codes) expect(["no_cover", "short_staffed", "gaps_across_brands"], `run ${run}`).toContain(code);
      // Doing nothing is never better than repairing.
      expect(mustFix(using, fixed).length).toBeLessThanOrEqual(mustFix(using, days).length);
      expect(changedDays(fixed, repair(using, fixed)), `run ${run} settles`).toEqual([]);
    }
  }, 60_000);
});

describe("suggestFixes", () => {
  it("offers people who are not trained only when nobody assigned can help", () => {
    const using = withLeave(leave("Priya Nair", "2026-12-14"));
    const fixed = repair(using, days);
    const fixes = suggestFixes(using, fixed, service("Glowleaf", "NDR"), "2026-12-14");
    expect(fixes.length).toBeGreaterThan(0);
    expect(fixes.length).toBeLessThanOrEqual(3);
    expect(fixes.every((f) => f.kind === "train" && f.newAssignment?.role === "backup")).toBe(true);
    const done = applyFixes(using, fixed, [fixes[0].key])!;
    expect(newMustFix(done.input, done.days)).toEqual([]);
    expect(done.newAssignments).toHaveLength(1);
  });

  it("offers an assigned backup first", () => {
    const away = days.map((d) => (d.employeeId === idOf("Arjun Rao") && d.date === "2026-12-15" ? { ...d, status: "leave" as const, duties: [] } : d));
    const using = withLeave(leave("Arjun Rao", "2026-12-15"));
    const fixes = suggestFixes(using, away, service("Pawprint Pantry", "CS"), "2026-12-15");
    expect(fixes[0].kind).toBe("cover");
    expect(fixes.some((f) => f.kind === "train")).toBe(false);
  });

  it("can move a weekly off inside the week without breaking anything", () => {
    // Both backups and the primary for Zestbowl: make only people on weekly off able to help.
    const saturday = "2026-12-12"; // Karan's weekly off
    const using = withLeave(leave("Nisha Pillai", saturday), leave("Vikram Sethi", saturday));
    const fixed = repair(using, days);
    const fixes = suggestFixes(using, fixed, service("Zestbowl", "CS"), saturday);
    const swap = fixes.find((f) => f.kind === "swap");
    expect(swap?.label).toContain("Karan Gill");
    expect(diffIssues(mustFix(using, fixed), mustFix(using, swap!.days)).added).toEqual([]);
  });

  it("never suggests undoing a day off the manager set by hand", () => {
    const edited = days.map((d) => (d.employeeId === idOf("Arjun Rao") && d.date === "2026-12-15" ? { ...d, status: "weekly_off" as const, duties: [], locked: true } : d));
    const fixes = suggestFixes(input, edited, service("Pawprint Pantry", "CS"), "2026-12-15");
    expect(fixes.length).toBeGreaterThan(0);
    expect(fixes.some((f) => f.label.includes("Arjun Rao"))).toBe(false);
  });

  it("offers nothing when there is no gap, and refuses made-up choices", () => {
    expect(suggestFixes(input, days, service("Glowleaf", "CS"), "2026-12-14")).toEqual([]);
    for (const key of ["cover.1.2026-12-14.1", "hack", "train.999.2026-12-14.1"]) expect(applyFixes(input, days, [key])).toBeNull();
  });
});

describe("describeChange and other dates", () => {
  it("explains Priya's leave before it is approved", () => {
    const using = withLeave(leave("Priya Nair", "2026-12-14"));
    const plan = describeChange({ input, days }, { input: using, days: repair(using, days) });
    expect(plan.gaps.map((g) => g.issue.message)).toEqual(["Glowleaf NDR has nobody; 1 person needed."]);
    expect(plan.gaps[0].fixes.length).toBeGreaterThan(0);
    expect(plan.changes).toHaveLength(2);
  });

  it("only offers dates that cause no must-fix problem", () => {
    const entry = { employeeId: idOf("Manav Shah"), kind: "leave" as const, startDate: "2026-12-16", endDate: "2026-12-16" };
    const options = otherLeaveDates(input, days, entry);
    expect(options).toHaveLength(3);
    for (const o of options) {
      const using = withLeave({ ...entry, ...o, status: "approved" });
      expect(newMustFix(using, repair(using, days))).toEqual([]);
    }
  });
});
