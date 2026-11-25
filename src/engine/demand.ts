import { weekdayOf } from "./dates.ts";
import type { RosterInput, Service } from "./types.ts";

type DemandInput = Pick<RosterInput, "brands" | "calendars" | "holidays" | "staffingRules">;

// How many people a service needs on a date. The most specific rule wins:
//   1. a rule for that exact date (can open a closed day or close an open one)
//   2. closed by the calendar -> 0
//   3. a rule for that weekday
//   4. the service's normal minimum
export function createDemand(input: DemandInput) {
  const brands = new Map(input.brands.map((b) => [b.id, b]));
  const calendars = new Map(input.calendars.map((c) => [c.id, c]));
  const holidays = new Set(input.holidays.map((h) => h.date));
  const byDate = new Map<string, number>();
  const byWeekday = new Map<string, number>();
  for (const r of input.staffingRules) {
    if (r.date !== null) byDate.set(`${r.serviceId}|${r.date}`, r.minStaff);
    else byWeekday.set(`${r.serviceId}|${r.weekday}`, r.minStaff);
  }

  return (service: Service, date: string): number => {
    const exact = byDate.get(`${service.id}|${date}`);
    if (exact !== undefined) return exact;
    const calendar = calendars.get(service.calendarId ?? brands.get(service.brandId)?.calendarId ?? -1);
    if (!calendar) throw new Error(`Service ${service.id} has no operating calendar`);
    const weekday = weekdayOf(date);
    const open = calendar.openDays.includes(weekday) && (calendar.openOnHolidays || !holidays.has(date));
    if (!open) return 0;
    return byWeekday.get(`${service.id}|${weekday}`) ?? service.minStaff;
  };
}
