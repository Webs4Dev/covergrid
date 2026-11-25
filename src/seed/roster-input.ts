import type { CheckInput } from "../engine/check.ts";
import * as data from "./data.ts";

/** The sample data in the shape the roster maker and checker need. */
export const sampleInput = (month: string): CheckInput => ({
  month,
  employees: data.employees,
  pods: data.pods,
  brands: data.brands,
  services: data.services,
  processes: data.processes,
  shifts: data.shifts,
  calendars: data.calendars,
  holidays: data.holidays,
  staffingRules: data.staffingRules,
  assignments: data.assignments,
  timeOff: data.timeOff,
  compOffCredits: data.compOffCredits,
});
