// Everything the roster logic needs, as plain data. No database, no framework.

export type Employee = {
  id: number;
  name: string;
  podId: number;
  weeklyOffCount: number;
  fixedOffDays: number[];
  unavailableDays: number[];
  preferredOffDays: number[];
  maxBrandsPerDay: number;
};
export type Service = {
  id: number;
  brandId: number;
  processId: number;
  calendarId: number | null;
  shiftId: number;
  minStaff: number;
};
export type Brand = { id: number; name: string; podId: number; calendarId: number };
export type Calendar = { id: number; name: string; openDays: number[]; openOnHolidays: boolean };
export type StaffingRule = {
  serviceId: number;
  weekday: number | null;
  date: string | null;
  minStaff: number;
};
export type Assignment = { employeeId: number; serviceId: number; role: "primary" | "backup" };
export type TimeOff = {
  employeeId: number;
  kind: "leave" | "comp_off" | "unavailable";
  status: "requested" | "approved" | "rejected" | "cancelled";
  startDate: string;
  endDate: string;
};
export type DayStatus = "working" | "weekly_off" | "holiday" | "leave" | "comp_off" | "unavailable";

export type RosterInput = {
  month: string; // "YYYY-MM"
  employees: Employee[];
  pods: { id: number; leadId: number | null }[];
  brands: Brand[];
  services: Service[];
  calendars: Calendar[];
  holidays: { date: string }[];
  staffingRules: StaffingRule[];
  assignments: Assignment[];
  timeOff: TimeOff[];
  // Days from the previous month's roster, so the week shared by two months
  // is counted once. Leave empty when there is no earlier roster.
  history?: { employeeId: number; date: string; status: DayStatus }[];
};

export type Duty = { serviceId: number; isBackup: boolean };
export type RosterDay = { employeeId: number; date: string; status: DayStatus; duties: Duty[]; locked?: boolean };
