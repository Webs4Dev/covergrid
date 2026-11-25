import { describe, expect, it } from "vitest";
import * as data from "../seed/data";
import { sampleInput } from "../seed/roster-input";
import { canPublish, checkRoster, type CheckInput, type IssueCode } from "./check";
import { generateRoster } from "./generate";
import type { RosterDay, TimeOff } from "./types";

const input = sampleInput("2026-12");
const good = generateRoster(input).days;
const idOf = (name: string) => data.employees.find((e) => e.name === name)!.id;
const serviceOf = (brand: string, code: string) =>
  data.services.find((s) => data.brands[s.brandId - 1].name === brand && data.processes[s.processId - 1].code === code)!.id;

/** The good roster with one person's day changed. */
function edit(name: string, date: string, change: Partial<RosterDay>) {
  return good.map((d) => (d.employeeId === idOf(name) && d.date === date ? { ...d, ...change } : d));
}
const approve = (name: string): CheckInput => ({
  ...input,
  timeOff: input.timeOff.map((t) => (t.employeeId === idOf(name) ? { ...t, status: "approved" as const } : t)),
});
const withTimeOff = (entry: Omit<TimeOff, "status">): CheckInput => ({
  ...input, timeOff: [...input.timeOff, { ...entry, status: "approved" }],
});
const find = (days: RosterDay[], code: IssueCode, date?: string, using: CheckInput = input) =>
  checkRoster(using, days).filter((i) => i.code === code && (!date || i.date === date));
const off = { status: "weekly_off" as const, duties: [] };

describe("the generated roster", () => {
  it("has one must-fix problem, explained as impossible", () => {
    const mustFix = checkRoster(input, good).filter((i) => i.severity === "must_fix");
    expect(mustFix).toHaveLength(1);
    expect(mustFix[0]).toMatchObject({ code: "short_staffed", date: "2026-12-25", serviceIds: [serviceOf("Trailhoof", "CS")] });
    expect(mustFix[0].reasons.join()).toContain("only 3 people are assigned");
    expect(canPublish(checkRoster(input, good))).toBe(false);
  });

  it("can be published once that demand is gone, even with preferences missed", () => {
    const calm = { ...input, staffingRules: input.staffingRules.filter((r) => r.minStaff < 4) };
    const issues = checkRoster(calm, generateRoster(calm).days);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.every((i) => i.severity === "preference")).toBe(true);
    expect(canPublish(issues)).toBe(true);
  });

  it.each(["2026-11", "2027-01", "2027-02", "2027-05", "2028-02"])("%s has no must-fix problems", (month) => {
    const other = sampleInput(month);
    expect(checkRoster(other, generateRoster(other).days).filter((i) => i.severity === "must_fix")).toEqual([]);
  });

  it("agrees about weeks shared with the month before", () => {
    const january = { ...sampleInput("2027-01"), history: good.filter((d) => d.date >= "2026-12-28") };
    expect(checkRoster(january, generateRoster(january).days).filter((i) => i.severity === "must_fix")).toEqual([]);
  });
});

describe("Priya's leave", () => {
  const ndr = serviceOf("Glowleaf", "NDR");

  it("is a gap as soon as it is approved, before the roster is repaired", () => {
    const using = approve("Priya Nair");
    expect(find(good, "working_when_away", "2026-12-14", using)).toHaveLength(1);
    const gaps = find(good, "no_cover", "2026-12-14", using);
    expect(gaps.map((g) => g.serviceIds[0])).toContain(ndr);
    expect(gaps.find((g) => g.serviceIds[0] === ndr)!.reasons.join()).toContain("Priya Nair has approved time off");
  });

  it("leaves only NDR uncovered after a new roster, and says why", () => {
    const using = approve("Priya Nair");
    const gaps = find(generateRoster(using).days, "no_cover", "2026-12-14", using);
    expect(gaps.map((g) => g.serviceIds)).toEqual([[ndr]]);
    expect(gaps[0].reasons).toEqual(["Priya Nair is on leave."]);
  });
});

describe("coverage problems", () => {
  it("names who could step in", () => {
    const [gap] = find(edit("Arjun Rao", "2026-12-15", off), "no_cover", "2026-12-15").filter(
      (i) => i.serviceIds[0] === serviceOf("Pawprint Pantry", "CS"),
    );
    expect(gap.reasons).toContain("Arjun Rao is on weekly off.");
    expect(gap.reasons).toContain("Kabir Anand is at work and could take this.");
  });

  it("separates short staffing from no cover", () => {
    const [gap] = find(edit("Ananya Das", "2026-12-15", off), "short_staffed", "2026-12-15");
    expect(gap.message).toBe("Lumora Home CS has 1 of the 2 people needed.");
  });

  it("reports one person's absence hurting several brands", () => {
    const [issue] = find(edit("Sana Sheikh", "2026-12-15", off), "gaps_across_brands", "2026-12-15");
    expect(issue.message).toContain("2 brands");
  });

  it("reports several brands when approved leave is not yet in the roster", () => {
    const using = withTimeOff({ employeeId: idOf("Sana Sheikh"), kind: "leave", startDate: "2026-12-15", endDate: "2026-12-15" });
    expect(find(good, "gaps_across_brands", "2026-12-15", using)).toHaveLength(1);
  });

  it("does not count someone who is not assigned to the work", () => {
    const days = good.map((d) => {
      if (d.date !== "2026-12-15") return d;
      if (d.employeeId === idOf("Priya Nair")) return { ...d, ...off };
      if (d.employeeId === idOf("Arjun Rao")) return { ...d, duties: [...d.duties, { serviceId: serviceOf("Glowleaf", "NDR"), isBackup: true }] };
      return d;
    });
    expect(find(days, "not_assigned", "2026-12-15")).toHaveLength(1);
    expect(find(days, "no_cover", "2026-12-15").some((i) => i.serviceIds[0] === serviceOf("Glowleaf", "NDR"))).toBe(true);
  });

  it("says when nobody is assigned at all", () => {
    const using = { ...input, assignments: input.assignments.filter((a) => a.serviceId !== serviceOf("Zestbowl", "CS")) };
    expect(find(generateRoster(using).days, "no_cover", "2026-12-15", using)[0].reasons).toEqual(["Nobody is assigned to Zestbowl CS."]);
  });

  it("reacts to a new brand requirement", () => {
    const rule = { serviceId: serviceOf("Cloudcrib", "CS"), weekday: null, date: "2026-12-16", minStaff: 2, note: "" };
    const using = { ...input, staffingRules: [...input.staffingRules, rule] };
    expect(find(good, "short_staffed", "2026-12-16", using)).toHaveLength(1);
  });
});

describe("people problems", () => {
  const day = "2026-12-15"; // a Tuesday
  const duty = (brand: string, code: string) => ({ serviceId: serviceOf(brand, code), isBackup: true });

  it("working on an unavailable weekday", () =>
    expect(find(edit("Yash Thakur", "2026-12-16", { status: "working" }), "working_when_away", "2026-12-16")).toHaveLength(1));
  it("working on a fixed off", () =>
    expect(find(edit("Ritu Saxena", "2026-12-13", { status: "working" }), "working_when_away", "2026-12-13")).toHaveLength(1));
  it("work left on a day off", () =>
    expect(find(edit("Arjun Rao", day, { status: "weekly_off" }), "duty_when_off", day)).toHaveLength(1));
  it("two shifts in one day", () => {
    const [issue] = find(edit("Nisha Pillai", day, { status: "working", duties: [duty("Zestbowl", "CS"), duty("Moonthread", "CS")] }), "shift_clash", day);
    expect(issue.reasons.join()).toContain("Evening");
  });
  it("too many brands", () => {
    const duties = [duty("Glowleaf", "CS"), duty("Pawprint Pantry", "CS"), duty("Brewmint", "CS"), duty("Little Acorns", "CS")];
    expect(find(edit("Meera Joshi", day, { status: "working", duties }), "too_many_brands", day)).toHaveLength(1);
  });
  it("too few weekly offs", () => {
    const days = good.map((d) => (d.employeeId === idOf("Arjun Rao") && d.status === "weekly_off" ? { ...d, status: "working" as const } : d));
    expect(find(days, "too_few_weekly_offs").length).toBeGreaterThanOrEqual(3);
    expect(find(days, "long_stretch")).toHaveLength(1);
  });
  it("an extra weekly off", () =>
    expect(find(edit("Meera Joshi", day, off), "extra_weekly_offs")).toHaveLength(1));
  it("a missing, repeated, unknown person or unknown work", () => {
    expect(find(good.slice(1), "missing_day")).toHaveLength(1);
    expect(find([...good, good[0]], "duplicate_day")).toHaveLength(1);
    expect(find([...good, { ...good[0], employeeId: 999 }], "unknown_employee")).toHaveLength(1);
    expect(find(edit("Arjun Rao", day, { duties: [{ serviceId: 999, isBackup: false }] }), "unknown_service", day)).toHaveLength(1);
  });
  it("work on a closed day", () =>
    expect(find(edit("Meera Joshi", "2026-12-13", { status: "working", duties: [duty("Little Acorns", "CS")] }), "closed_service", "2026-12-13")).toHaveLength(1));
  it("leave or holiday shown without a reason for it", () => {
    expect(find(edit("Meera Joshi", day, { status: "leave", duties: [] }), "status_mismatch", day)).toHaveLength(1);
    expect(find(edit("Meera Joshi", day, { status: "holiday", duties: [] }), "status_mismatch", day)).toHaveLength(1);
  });
  it("a comp-off that was never earned, or was earned later", () => {
    const using = withTimeOff({ employeeId: idOf("Pooja Iyer"), kind: "comp_off", startDate: day, endDate: day });
    expect(find(good, "comp_off_not_earned", day, using)).toHaveLength(1);
    const late = { ...using, compOffCredits: [...input.compOffCredits, { employeeId: idOf("Pooja Iyer"), earnedOn: "2026-12-20" }] };
    expect(find(good, "comp_off_not_earned", day, late)).toHaveLength(1);
    const earned = { ...using, compOffCredits: [...input.compOffCredits, { employeeId: idOf("Pooja Iyer"), earnedOn: "2026-12-01" }] };
    expect(find(good, "comp_off_not_earned", day, earned)).toHaveLength(0);
  });
  it("a missed preference is never must-fix", () => {
    const missed = find(good, "preferred_off_missed");
    expect(missed.length).toBeGreaterThan(0);
    expect(missed.every((i) => i.severity === "preference")).toBe(true);
  });
});
