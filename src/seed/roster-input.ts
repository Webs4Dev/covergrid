import type { RosterInput } from "../engine/types.ts";
import * as data from "./data.ts";

/** The sample data in the shape the roster maker needs. */
export const sampleInput = (month: string): RosterInput => ({
  month,
  employees: data.employees,
  pods: data.pods,
  brands: data.brands,
  services: data.services,
  calendars: data.calendars,
  holidays: data.holidays,
  staffingRules: data.staffingRules,
  assignments: data.assignments,
  timeOff: data.timeOff,
});
