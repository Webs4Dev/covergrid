// One description per data type. The list page, the form and the input checks are
// all built from this, so adding a field or a whole new type happens here.

export type RefName = "pods" | "employees" | "brands" | "processes" | "calendars" | "shifts" | "services";
export type Option = { value: string; label: string };

type Base = { name: string; label: string; required?: boolean; help?: string; hideInList?: boolean };
export type Field = Base &
  (
    | { type: "text"; max?: number }
    | { type: "number"; min: number; max: number; initial?: number }
    | { type: "date" }
    | { type: "time" }
    | { type: "checkbox"; initial?: boolean }
    | { type: "weekdays" }
    | { type: "weekday" } // one day of the week
    | { type: "ref"; ref: RefName; emptyLabel?: string }
    | { type: "choice"; options: Option[] }
  );

export type Entity = {
  title: string;
  one: string; // singular, lower case
  about: string;
  fields: Field[];
  deleteNote: string;
};

export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const choices = (...values: string[]): Option[] =>
  values.map((value) => ({ value, label: (value[0].toUpperCase() + value.slice(1)).replace("_", "-") }));

const name: Field = { name: "name", label: "Name", type: "text", required: true, max: 80 };
const active: Field = { name: "isActive", label: "Active", type: "checkbox", initial: true, help: "Untick to stop using it without deleting its history." };
const minStaff = (min: number): Field => ({ name: "minStaff", label: "People needed", type: "number", min, max: 50, required: true, initial: 1 });

export const entities = {
  employees: {
    title: "Employees",
    one: "employee",
    about: "People, their pod, days off and daily limits.",
    deleteNote: "Their assignments are removed too. If they have time off or a roster, switch them off instead.",
    fields: [
      name,
      { name: "podId", label: "Pod", type: "ref", ref: "pods", required: true },
      { name: "weeklyOffCount", label: "Weekly offs per week", type: "number", min: 0, max: 6, required: true, initial: 1 },
      { name: "fixedOffDays", label: "Always off on", type: "weekdays", help: "Must be respected." },
      { name: "unavailableDays", label: "Cannot work on", type: "weekdays", help: "Must be respected. Does not count as a weekly off." },
      { name: "preferredOffDays", label: "Prefers off on", type: "weekdays", help: "A wish: client coverage comes first." },
      { name: "maxBrandsPerDay", label: "Most brands in a day", type: "number", min: 1, max: 20, required: true, initial: 2 },
      active,
    ],
  },
  pods: {
    title: "Pods",
    one: "pod",
    about: "Operational teams and who leads them.",
    deleteNote: "A pod with employees or brands cannot be deleted.",
    fields: [
      name,
      { name: "leadId", label: "Pod lead", type: "ref", ref: "employees", emptyLabel: "No lead yet", help: "Add the person to this pod first." },
      active,
    ],
  },
  brands: {
    title: "Brands",
    one: "brand",
    about: "Client brands, the pod that looks after each, and its usual operating calendar.",
    deleteNote: "A brand with processes cannot be deleted. Switch it off instead.",
    fields: [
      name,
      { name: "podId", label: "Pod", type: "ref", ref: "pods", required: true },
      { name: "calendarId", label: "Operating calendar", type: "ref", ref: "calendars", required: true },
      active,
    ],
  },
  services: {
    title: "Brand processes",
    one: "brand process",
    about: "Each piece of work that needs cover: one process for one brand.",
    deleteNote: "Its assignments and staffing rules are removed too. If it is in a roster, switch it off instead.",
    fields: [
      { name: "brandId", label: "Brand", type: "ref", ref: "brands", required: true },
      { name: "processId", label: "Process", type: "ref", ref: "processes", required: true },
      { name: "calendarId", label: "Operating calendar", type: "ref", ref: "calendars", emptyLabel: "Same as the brand" },
      { name: "shiftId", label: "Shift", type: "ref", ref: "shifts", required: true },
      minStaff(1),
      active,
    ],
  },
  assignments: {
    title: "Assignments",
    one: "assignment",
    about: "Who does which work. A backup only covers when needed.",
    deleteNote: "The person will no longer cover this work.",
    fields: [
      { name: "employeeId", label: "Employee", type: "ref", ref: "employees", required: true },
      { name: "serviceId", label: "Brand process", type: "ref", ref: "services", required: true },
      { name: "role", label: "Role", type: "choice", options: choices("primary", "backup"), required: true },
    ],
  },
  processes: {
    title: "Processes",
    one: "process",
    about: "Kinds of work, such as customer support.",
    deleteNote: "A process used by a brand cannot be deleted.",
    fields: [
      { name: "code", label: "Short code", type: "text", required: true, max: 12 },
      name,
      active,
    ],
  },
  calendars: {
    title: "Operating calendars",
    one: "calendar",
    about: "Which days work must be covered.",
    deleteNote: "A calendar used by a brand cannot be deleted.",
    fields: [
      name,
      { name: "openDays", label: "Open on", type: "weekdays", required: true },
      { name: "openOnHolidays", label: "Open on public holidays", type: "checkbox", initial: false },
    ],
  },
  shifts: {
    title: "Shifts",
    one: "shift",
    about: "Working hours. A shift cannot run past midnight.",
    deleteNote: "A shift used by a brand process cannot be deleted.",
    fields: [
      name,
      { name: "startTime", label: "Starts", type: "time", required: true },
      { name: "endTime", label: "Ends", type: "time", required: true },
    ],
  },
  "staffing-rules": {
    title: "Staffing rules",
    one: "staffing rule",
    about: "Exceptions: a different number of people on a weekday or on one date.",
    deleteNote: "The normal number of people applies again.",
    fields: [
      { name: "serviceId", label: "Brand process", type: "ref", ref: "services", required: true },
      { name: "weekday", label: "Every week on", type: "weekday", help: "Choose a weekday or a date, not both." },
      { name: "date", label: "Or only on", type: "date", help: "A date rule can open a closed day. Use 0 people to close one." },
      minStaff(0),
      { name: "note", label: "Note", type: "text", max: 200 },
    ],
  },
  holidays: {
    title: "Public holidays",
    one: "holiday",
    about: "Dates that count as public holidays for every calendar.",
    deleteNote: "The date becomes a normal day again.",
    fields: [
      { name: "date", label: "Date", type: "date", required: true },
      name,
    ],
  },
  "time-off": {
    title: "Time off",
    one: "time off entry",
    about: "Leave, comp-offs and unavailable dates. Only approved entries affect a roster.",
    deleteNote: "The entry is removed completely.",
    fields: [
      { name: "employeeId", label: "Employee", type: "ref", ref: "employees", required: true },
      { name: "kind", label: "Type", type: "choice", options: choices("leave", "comp_off", "unavailable"), required: true },
      { name: "status", label: "Status", type: "choice", options: choices("requested", "approved", "rejected", "cancelled"), required: true },
      { name: "startDate", label: "From", type: "date", required: true },
      { name: "endDate", label: "To", type: "date", required: true },
      { name: "reason", label: "Reason", type: "text", max: 200 },
    ],
  },
  "comp-offs": {
    title: "Comp-off credits",
    one: "comp-off credit",
    about: "Days earned by working on a holiday or day off.",
    deleteNote: "The earned day is removed.",
    fields: [
      { name: "employeeId", label: "Employee", type: "ref", ref: "employees", required: true },
      { name: "earnedOn", label: "Earned on", type: "date", required: true },
      { name: "reason", label: "Reason", type: "text", required: true, max: 200 },
    ],
  },
} satisfies Record<string, Entity>;

export type EntityName = keyof typeof entities;
export const isEntityName = (value: string): value is EntityName => Object.hasOwn(entities, value);

export const navigation: { heading: string; items: EntityName[] }[] = [
  { heading: "People", items: ["employees", "pods"] },
  { heading: "Clients", items: ["brands", "services", "assignments", "processes"] },
  { heading: "Rules", items: ["calendars", "shifts", "staffing-rules", "holidays"] },
  { heading: "Time off", items: ["time-off", "comp-offs"] },
];
