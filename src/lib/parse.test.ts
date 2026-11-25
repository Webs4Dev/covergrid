import { describe, expect, it } from "vitest";
import { entities, isEntityName, type EntityName } from "./entities";
import { parseForm } from "./parse";

function parse(entity: EntityName, input: Record<string, string | string[]>) {
  const form = new FormData();
  for (const [key, value] of Object.entries(input)) for (const v of [value].flat()) form.append(key, v);
  return parseForm(entity, form);
}
const employee = { name: " Asha ", podId: "1", weeklyOffCount: "1", maxBrandsPerDay: "2", preferredOffDays: ["6", "0", "0"], isActive: "on" };

describe("parseForm", () => {
  it("cleans and converts a good entry", () => {
    const { values, errors } = parse("employees", employee);
    expect(errors).toEqual({});
    expect(values).toMatchObject({ name: "Asha", podId: 1, preferredOffDays: [0, 6], fixedOffDays: [], isActive: true });
  });

  it("asks for missing fields and ignores unknown ones", () => {
    const { values, errors } = parse("employees", { id: "99" });
    expect(Object.keys(errors).sort()).toEqual(["maxBrandsPerDay", "name", "podId", "weeklyOffCount"]);
    expect(values).not.toHaveProperty("id");
  });

  it.each([
    ["weeklyOffCount", "7"],
    ["weeklyOffCount", "-1"],
    ["maxBrandsPerDay", "1.5"],
    ["podId", "1 or 1=1"],
    ["name", "x".repeat(81)],
    ["preferredOffDays", "9"],
  ])("rejects bad %s", (field, bad) => {
    expect(parse("employees", { ...employee, [field]: bad }).errors).toHaveProperty(field);
  });

  it("rejects dates that do not exist and choices not on the list", () => {
    expect(parse("holidays", { date: "2027-02-30", name: "x" }).errors).toHaveProperty("date");
    expect(parse("assignments", { employeeId: "1", serviceId: "1", role: "boss" }).errors).toHaveProperty("role");
  });

  it("checks fields that depend on each other", () => {
    expect(parse("shifts", { name: "n", startTime: "18:00", endTime: "09:00" }).errors).toHaveProperty("endTime");
    expect(parse("staffing-rules", { serviceId: "1", minStaff: "1" }).errors).toHaveProperty("weekday");
    expect(parse("staffing-rules", { serviceId: "1", minStaff: "0", weekday: "0" }).errors).toEqual({});
    expect(parse("staffing-rules", { serviceId: "1", minStaff: "1", weekday: "1", date: "2026-12-01" }).errors).toHaveProperty("weekday");
    const off = { employeeId: "1", kind: "comp_off", status: "approved", startDate: "2026-12-01", endDate: "2026-12-02" };
    expect(parse("time-off", off).errors).toHaveProperty("endDate");
    expect(parse("time-off", { ...off, kind: "leave", endDate: "2026-11-30" }).errors).toHaveProperty("endDate");
  });

  it("only accepts known data types", () => {
    expect(isEntityName("employees")).toBe(true);
    for (const bad of ["constructor", "__proto__", "users"]) expect(isEntityName(bad)).toBe(false);
    expect(Object.keys(entities)).toHaveLength(12);
  });
});
