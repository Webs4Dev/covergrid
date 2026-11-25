// Turns a roster into what the screens show. Pure functions, so they can be tested.
import { coverRules, type CheckInput } from "../engine/check.ts";
import { monthDates } from "../engine/dates.ts";
import { createDemand } from "../engine/demand.ts";
import type { RosterDay, Service } from "../engine/types.ts";

export type Coverage = { need: number; have: number };

export function createView(input: CheckInput, days: RosterDay[]) {
  const dates = monthDates(input.month);
  const demand = createDemand(input);
  const { cannotWork, counts } = coverRules(input);
  const byPerson = new Map(days.map((d) => [`${d.employeeId}|${d.date}`, d]));
  const byDate = new Map<string, RosterDay[]>();
  for (const d of days) byDate.set(d.date, [...(byDate.get(d.date) ?? []), d]);

  const brands = new Map(input.brands.map((b) => [b.id, b.name]));
  const processes = new Map(input.processes.map((p) => [p.id, p.code]));
  const services = new Map(input.services.map((s) => [s.id, s]));
  const serviceName = (id: number) => {
    const s = services.get(id);
    return s ? `${brands.get(s.brandId) ?? "?"} ${processes.get(s.processId) ?? "?"}` : "Removed work";
  };

  const coverage = (service: Service, date: string): Coverage => ({
    need: demand(service, date),
    have: (byDate.get(date) ?? []).filter((d) => counts(d, service.id)).length,
  });

  return {
    dates,
    serviceName,
    coverage,
    day: (employeeId: number, date: string) => byPerson.get(`${employeeId}|${date}`),
    /** Why a person marked as working cannot be, if the data changed since. */
    conflict: (employeeId: number, date: string) =>
      byPerson.get(`${employeeId}|${date}`)?.status === "working" ? cannotWork(employeeId, date) : [],
    /** How many of these services are short of people on a date. */
    shortOn: (list: Service[], date: string) =>
      list.filter((s) => {
        const c = coverage(s, date);
        return c.have < c.need;
      }).length,
  };
}

export type RosterViewData = ReturnType<typeof createView>;
