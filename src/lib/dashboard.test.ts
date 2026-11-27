import { describe, expect, it } from "vitest";
import { repair } from "../engine/change";
import { checkRoster } from "../engine/check";
import { generateRoster } from "../engine/generate";
import { sampleInput } from "../seed/roster-input";
import { buildTasks, summarise } from "./dashboard";

const input = sampleInput("2026-12");
const days = generateRoster(input).days;
const base = { month: "2026-12", issues: checkRoster(input, days), outdated: 0, requests: [], format: (d: string) => d };

describe("summarise", () => {
  const { calendar, lead, totals, shortServices } = summarise(input, days);

  it("counts every place and the one that is missing", () => {
    expect(totals.needed - totals.covered).toBe(1);
    expect(calendar.filter((d) => d.short > 0).map((d) => d.date)).toEqual(["2026-12-25"]);
    expect(shortServices.size).toBe(1);
  });

  it("lays December 2026 out from a Tuesday", () => {
    expect(calendar).toHaveLength(31);
    expect(lead).toBe(1);
    expect(calendar[24].holiday).toBe(true);
  });

  it("shows nothing as short before a roster exists", () => {
    const empty = summarise(input, null);
    expect(empty.totals.covered).toBe(0);
    expect(empty.calendar.every((d) => d.short === 0)).toBe(true);
  });
});

describe("buildTasks", () => {
  it("starts with generating when there is no roster", () => {
    const tasks = buildTasks({ ...base, roster: null, issues: [] });
    expect(tasks.map((t) => t.key)).toEqual(["generate"]);
  });

  it("orders problems, then leave, then publishing", () => {
    const requests = [{ id: 7, name: "Priya Nair", startDate: "2026-12-14", endDate: "2026-12-14" }];
    const tasks = buildTasks({ ...base, roster: { status: "draft" }, requests });
    expect(tasks.map((t) => t.kind)).toEqual(["problem", "leave", "step"]);
    expect(tasks[0].href).toContain("/roster/fix?month=2026-12");
    expect(tasks[1].href).toBe("/roster/leave?id=7");
  });

  it("leaves days a repair will fill out of the list, instead of one task per day", () => {
    const added = { ...input, employees: [...input.employees, { ...input.employees[0], id: 500, name: "New Person" }] };
    const issues = checkRoster(added, days);
    expect(issues.filter((i) => i.code === "missing_day")).toHaveLength(31);
    const afterRepair = checkRoster(added, repair(added, days));
    const tasks = buildTasks({ ...base, issues, afterRepair, outdated: 31, roster: { status: "draft" } });
    expect(tasks.filter((t) => t.title.includes("New Person"))).toEqual([]);
    expect(tasks[0]).toMatchObject({ key: "repair" });
    // The impossible Christmas gap still needs a decision, so it stays listed.
    expect(tasks.some((t) => t.title.startsWith("Trailhoof CS"))).toBe(true);
  });

  it("has no publish step once published", () => {
    expect(buildTasks({ ...base, roster: { status: "published" }, issues: [] })).toEqual([]);
  });
});
