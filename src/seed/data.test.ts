import { describe, expect, it } from "vitest";
import * as data from "./data";

const primaries = (serviceIds: number[]) =>
  new Set(
    data.assignments
      .filter((a) => a.role === "primary" && serviceIds.includes(a.serviceId))
      .map((a) => a.employeeId),
  );
const staffOfBrand = (brandId: number) =>
  primaries(data.services.filter((s) => s.brandId === brandId).map((s) => s.id));

describe("sample data matches the brief", () => {
  it("has at least 30 uniquely named employees in several pods", () => {
    expect(data.employees.length).toBeGreaterThanOrEqual(30);
    expect(new Set(data.employees.map((e) => e.name)).size).toBe(data.employees.length);
    expect(data.pods.length).toBeGreaterThan(1);
  });

  it("gives each pod a lead from its own team", () => {
    for (const pod of data.pods) {
      expect(data.employees.find((e) => e.id === pod.leadId)?.podId).toBe(pod.id);
    }
  });

  it("has 80% single-person brands and the rest with two or three people", () => {
    const sizes = data.brands.map((b) => staffOfBrand(b.id).size);
    expect(sizes.filter((n) => n === 1).length / sizes.length).toBe(0.8);
    expect(sizes.every((n) => n >= 1 && n <= 3)).toBe(true);
  });

  it("gives every service a primary", () => {
    for (const s of data.services) expect(primaries([s.id]).size).toBeGreaterThan(0);
  });

  it("has separate processes, shared processes, and one needing two people", () => {
    const multi = data.brands.filter((b) => staffOfBrand(b.id).size > 1);
    const multiServices = data.services.filter((s) => multi.some((b) => b.id === s.brandId));
    expect(multiServices.some((s) => primaries([s.id]).size === 1)).toBe(true);
    expect(multiServices.some((s) => primaries([s.id]).size > 1)).toBe(true);
    expect(data.services.some((s) => s.minStaff > 1)).toBe(true);
  });

  it("has a person on several brands and a brand whose processes differ in calendar", () => {
    const brandsOf = (id: number) =>
      new Set(
        data.assignments
          .filter((a) => a.employeeId === id && a.role === "primary")
          .map((a) => data.services[a.serviceId - 1].brandId),
      );
    expect(data.employees.some((e) => brandsOf(e.id).size > 1)).toBe(true);
    expect(data.services.some((s) => s.calendarId !== null)).toBe(true);
  });

  it("uses all three calendar types", () => {
    const used = new Set(data.services.map((s) => s.calendarId ?? data.brands[s.brandId - 1].calendarId));
    expect(used.size).toBe(3);
  });
});

describe("sample data is consistent", () => {
  it("never assigns someone to the same service twice", () => {
    const keys = data.assignments.map((a) => `${a.employeeId}-${a.serviceId}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("never needs a primary to work two shifts or exceed their brand limit", () => {
    for (const e of data.employees) {
      const own = data.assignments
        .filter((a) => a.employeeId === e.id && a.role === "primary")
        .map((a) => data.services[a.serviceId - 1]);
      expect(new Set(own.map((s) => s.shiftId)).size).toBeLessThanOrEqual(1);
      expect(new Set(own.map((s) => s.brandId)).size).toBeLessThanOrEqual(e.maxBrandsPerDay);
    }
  });

  it("only asks for more people than know the work in the one planned case", () => {
    const qualified = (id: number) => data.assignments.filter((a) => a.serviceId === id).length;
    for (const s of data.services) expect(qualified(s.id)).toBeGreaterThanOrEqual(s.minStaff);
    const impossible = data.staffingRules.filter((r) => qualified(r.serviceId) < r.minStaff);
    expect(impossible.map((r) => r.date)).toEqual(["2026-12-25"]);
  });

  it("has a comp-off credit behind every approved comp-off", () => {
    for (const t of data.timeOff.filter((x) => x.kind === "comp_off" && x.status === "approved")) {
      expect(data.compOffCredits.some((c) => c.employeeId === t.employeeId && c.earnedOn < t.startDate)).toBe(true);
    }
  });
});
