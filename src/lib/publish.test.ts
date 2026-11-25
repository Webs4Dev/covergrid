import { describe, expect, it } from "vitest";
import { checkRoster } from "../engine/check";
import { generateRoster } from "../engine/generate";
import { holidays } from "../seed/data";
import { sampleInput } from "../seed/roster-input";
import { holidayCredits, publishProblem } from "./publish";

const input = { ...sampleInput("2026-12"), holidays };
const days = generateRoster(input).days;

describe("publishProblem", () => {
  const issues = checkRoster(input, days);

  it("blocks must-fix problems without a real reason", () => {
    expect(publishProblem(issues, "")).toContain("must-fix");
    expect(publishProblem(issues, "ok")).toContain("must-fix");
    expect(publishProblem(issues, "Client agreed to three people on the 25th.")).toBeNull();
  });

  it("needs no reason when only preferences are left, and limits length", () => {
    const preferences = issues.filter((i) => i.severity === "preference");
    expect(publishProblem(preferences, "")).toBeNull();
    expect(publishProblem(preferences, "x".repeat(301))).not.toBeNull();
  });
});

describe("holidayCredits", () => {
  const credits = holidayCredits(input, days);

  it("gives one credit to each person who covers work on a holiday", () => {
    const worked = days.filter((d) => d.date === "2026-12-25" && d.duties.length > 0);
    expect(worked.length).toBeGreaterThan(0);
    expect(credits).toHaveLength(worked.length);
    expect(credits.every((c) => c.earnedOn === "2026-12-25" && c.reason === "Roster: worked on Christmas")).toBe(true);
  });

  it("gives nothing for days off", () => {
    expect(holidayCredits(input, days.map((d) => ({ ...d, status: "weekly_off" as const })))).toEqual([]);
  });
});
