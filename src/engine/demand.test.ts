import { describe, expect, it } from "vitest";
import { createDemand } from "./demand";

const service = { id: 1, brandId: 1, processId: 1, calendarId: null, shiftId: 1, minStaff: 1 };
const input = {
  brands: [{ id: 1, name: "B", podId: 1, calendarId: 1 }],
  calendars: [
    { id: 1, name: "Sundays and holidays off", openDays: [1, 2, 3, 4, 5, 6], openOnHolidays: false },
    { id: 2, name: "365", openDays: [0, 1, 2, 3, 4, 5, 6], openOnHolidays: true },
  ],
  holidays: [{ date: "2026-12-25" }],
  staffingRules: [
    { serviceId: 1, weekday: 6, date: null, minStaff: 2 },
    { serviceId: 1, weekday: 5, date: null, minStaff: 3 },
    { serviceId: 1, weekday: null, date: "2026-12-26", minStaff: 0 },
    { serviceId: 1, weekday: null, date: "2026-12-27", minStaff: 4 },
  ],
};

describe("createDemand", () => {
  const need = createDemand(input);
  it.each([
    ["normal weekday", "2026-12-21", 1],
    ["weekday rule", "2026-12-19", 2],
    ["closed Sunday", "2026-12-20", 0],
    ["holiday beats a weekday rule", "2026-12-25", 0],
    ["date rule closes an open day", "2026-12-26", 0],
    ["date rule opens a closed day", "2026-12-27", 4],
  ])("%s", (_, date, expected) => expect(need(service, date)).toBe(expected));

  it("lets a service replace its brand's calendar", () => {
    expect(need({ ...service, calendarId: 2 }, "2026-12-20")).toBe(1);
  });
});
