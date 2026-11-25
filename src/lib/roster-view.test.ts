import { describe, expect, it } from "vitest";
import { checkRoster } from "../engine/check";
import { generateRoster } from "../engine/generate";
import { sampleInput } from "../seed/roster-input";
import { isMonth, monthChoices, monthLabel } from "./months";
import { createView } from "./roster-view";

describe("createView", () => {
  const input = sampleInput("2026-12");
  const days = generateRoster(input).days;

  it("shows exactly the shortfalls the checker reports, even after changes", () => {
    const changed = {
      ...input,
      timeOff: input.timeOff.map((t) => (t.status === "requested" ? { ...t, status: "approved" as const } : t)),
    };
    for (const using of [input, changed]) {
      const view = createView(using, days);
      const shown = view.dates.flatMap((date) =>
        using.services.filter((s) => view.coverage(s, date).have < view.coverage(s, date).need).map((s) => `${date}|${s.id}`),
      );
      const reported = checkRoster(using, days)
        .filter((i) => i.code === "no_cover" || i.code === "short_staffed")
        .map((i) => `${i.date}|${i.serviceIds[0]}`);
      expect(shown.sort()).toEqual(reported.sort());
    }
  });

  it("flags someone shown working during approved leave", () => {
    const priya = input.employees.find((e) => e.name === "Priya Nair")!.id;
    const changed = { ...input, timeOff: [{ employeeId: priya, kind: "leave" as const, status: "approved" as const, startDate: "2026-12-14", endDate: "2026-12-14" }] };
    expect(createView(input, days).conflict(priya, "2026-12-14")).toEqual([]);
    expect(createView(changed, days).conflict(priya, "2026-12-14")).toHaveLength(1);
  });
});

describe("months", () => {
  it("offers thirteen months across a year end", () => {
    const list = monthChoices(new Date("2026-11-25T00:00:00Z"));
    expect([list[0], list[1], list[2], list[12]]).toEqual(["2026-11", "2026-12", "2027-01", "2027-11"]);
    expect(monthLabel("2026-12")).toBe("December 2026");
    expect(isMonth("2026-13")).toBe(false);
  });
});
