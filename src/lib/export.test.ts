import { describe, expect, it } from "vitest";
import { generateRoster } from "../engine/generate";
import * as data from "../seed/data";
import { sampleInput } from "../seed/roster-input";
import { exportRows, toCsv } from "./export";

const input = { ...sampleInput("2026-12"), pods: data.pods };
const days = generateRoster(input).days;

describe("exportRows", () => {
  it("lists every person once with every date in the grid", () => {
    const rows = exportRows("grid", input, days);
    expect(rows).toHaveLength(33);
    expect(rows.every((r) => r.length === 33)).toBe(true);
    expect(rows.flat()).toContain("Backup");
  });

  it("has one row for each duty, and one for each day without work", () => {
    const rows = exportRows("duties", input, days).slice(1);
    const expected = days.reduce((n, d) => n + Math.max(1, d.duties.length), 0);
    expect(rows).toHaveLength(expected);
  });

  it("marks the one short service", () => {
    const short = exportRows("coverage", input, days).filter((r) => r[4] === "SHORT");
    expect(short).toEqual([["2026-12-25", "Trailhoof CS", 4, 3, "SHORT"]]);
  });

  it("says when someone can no longer work", () => {
    const changed = { ...input, timeOff: input.timeOff.map((t) => ({ ...t, status: "approved" as const })) };
    expect(exportRows("grid", changed, days).flat()).toContain("Cannot work");
  });
});

describe("toCsv", () => {
  it("quotes commas, quotes and line breaks", () => {
    expect(toCsv([["a,b", 'say "hi"', "two\nlines", 3]])).toBe('﻿"a,b","say ""hi""","two\nlines",3\r\n');
  });

  it.each(["=HYPERLINK(1)", "+1", "-1", "@cmd", "\tx"])("stops %j running as a formula", (bad) => {
    expect(toCsv([[bad]]).slice(1)).toMatch(/^"?'/);
  });

  it("leaves numbers alone", () => expect(toCsv([[-1]])).toBe("﻿-1\r\n"));
});
