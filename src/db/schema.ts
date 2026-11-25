import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  check,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  time,
  timestamp,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// Conventions
// - Weekdays are numbers: 0 = Sunday ... 6 = Saturday.
// - Dates are plain "YYYY-MM-DD" text in code, so time zones can never shift a day.
// - People, brands and pods are switched off (is_active) instead of deleted once
//   a roster uses them, so old rosters stay readable.

const id = () => integer("id").primaryKey().generatedAlwaysAsIdentity();
const weekdays = (name: string) => smallint(name).array().notNull().default([]);
const validWeekdays = (column: AnyPgColumn) =>
  sql`${column} <@ ARRAY[0,1,2,3,4,5,6]::smallint[]`;

// ---------- Who and what ----------

export const pods = pgTable("pods", {
  id: id(),
  name: text("name").notNull().unique(),
  leadId: integer("lead_id").references((): AnyPgColumn => employees.id, { onDelete: "set null" }),
  isActive: boolean("is_active").notNull().default(true),
});

export const employees = pgTable(
  "employees",
  {
    id: id(),
    name: text("name").notNull(),
    podId: integer("pod_id").notNull().references(() => pods.id),
    weeklyOffCount: smallint("weekly_off_count").notNull().default(1),
    // Must be respected: always off, and never able to work, on these weekdays.
    fixedOffDays: weekdays("fixed_off_days"),
    unavailableDays: weekdays("unavailable_days"),
    // Nice to have: may be broken to protect client coverage.
    preferredOffDays: weekdays("preferred_off_days"),
    maxBrandsPerDay: smallint("max_brands_per_day").notNull().default(2),
    isActive: boolean("is_active").notNull().default(true),
  },
  (t) => [
    index("employees_pod_idx").on(t.podId),
    check("employees_weekly_off_count", sql`${t.weeklyOffCount} between 0 and 6`),
    check("employees_max_brands", sql`${t.maxBrandsPerDay} >= 1`),
    check("employees_fixed_off_days", validWeekdays(t.fixedOffDays)),
    check("employees_unavailable_days", validWeekdays(t.unavailableDays)),
    check("employees_preferred_off_days", validWeekdays(t.preferredOffDays)),
  ],
);

export const processes = pgTable("processes", {
  id: id(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  isActive: boolean("is_active").notNull().default(true),
});

// ---------- When work must happen ----------

export const operatingCalendars = pgTable(
  "operating_calendars",
  {
    id: id(),
    name: text("name").notNull().unique(),
    openDays: weekdays("open_days"),
    openOnHolidays: boolean("open_on_holidays").notNull(),
  },
  (t) => [check("operating_calendars_open_days", validWeekdays(t.openDays))],
);

export const shifts = pgTable(
  "shifts",
  {
    id: id(),
    name: text("name").notNull().unique(),
    startTime: time("start_time").notNull(),
    endTime: time("end_time").notNull(),
  },
  (t) => [check("shifts_same_day", sql`${t.endTime} > ${t.startTime}`)],
);

export const holidays = pgTable("holidays", {
  date: date("date").primaryKey(),
  name: text("name").notNull(),
});

export const brands = pgTable(
  "brands",
  {
    id: id(),
    name: text("name").notNull().unique(),
    podId: integer("pod_id").notNull().references(() => pods.id),
    calendarId: integer("calendar_id").notNull().references(() => operatingCalendars.id),
    isActive: boolean("is_active").notNull().default(true),
  },
  (t) => [index("brands_pod_idx").on(t.podId)],
);

// One process run for one brand, for example "GlowSkin + Customer Support".
// This is the unit that needs coverage.
export const services = pgTable(
  "services",
  {
    id: id(),
    brandId: integer("brand_id").notNull().references(() => brands.id),
    processId: integer("process_id").notNull().references(() => processes.id),
    // Empty means "use the brand's calendar".
    calendarId: integer("calendar_id").references(() => operatingCalendars.id),
    shiftId: integer("shift_id").notNull().references(() => shifts.id),
    minStaff: smallint("min_staff").notNull().default(1),
    isActive: boolean("is_active").notNull().default(true),
  },
  (t) => [
    unique("services_brand_process").on(t.brandId, t.processId),
    check("services_min_staff", sql`${t.minStaff} >= 1`),
  ],
);

// Exceptions to a service's normal need, for one weekday or one exact date.
// A date rule can also open a closed day, or close an open day (min_staff = 0).
export const staffingRules = pgTable(
  "staffing_rules",
  {
    id: id(),
    serviceId: integer("service_id").notNull().references(() => services.id, { onDelete: "cascade" }),
    weekday: smallint("weekday"),
    date: date("date"),
    minStaff: smallint("min_staff").notNull(),
    note: text("note"),
  },
  (t) => [
    uniqueIndex("staffing_rules_weekday").on(t.serviceId, t.weekday),
    uniqueIndex("staffing_rules_date").on(t.serviceId, t.date),
    check("staffing_rules_one_kind", sql`num_nonnulls(${t.weekday}, ${t.date}) = 1`),
    check("staffing_rules_weekday_range", sql`${t.weekday} between 0 and 6`),
    check("staffing_rules_min_staff", sql`${t.minStaff} >= 0`),
  ],
);

// ---------- Who can do which work ----------

export const assignmentRole = pgEnum("assignment_role", ["primary", "backup"]);

export const assignments = pgTable(
  "assignments",
  {
    employeeId: integer("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
    serviceId: integer("service_id").notNull().references(() => services.id, { onDelete: "cascade" }),
    role: assignmentRole("role").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.employeeId, t.serviceId] }),
    index("assignments_service_idx").on(t.serviceId),
  ],
);

// ---------- Time away ----------

export const timeOffKind = pgEnum("time_off_kind", ["leave", "comp_off", "unavailable"]);
export const timeOffStatus = pgEnum("time_off_status", ["requested", "approved", "rejected", "cancelled"]);

export const timeOff = pgTable(
  "time_off",
  {
    id: id(),
    employeeId: integer("employee_id").notNull().references(() => employees.id),
    kind: timeOffKind("kind").notNull(),
    status: timeOffStatus("status").notNull().default("requested"),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    reason: text("reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("time_off_employee_dates_idx").on(t.employeeId, t.startDate, t.endDate),
    check("time_off_date_order", sql`${t.endDate} >= ${t.startDate}`),
    check("time_off_comp_off_one_day", sql`${t.kind} <> 'comp_off' or ${t.startDate} = ${t.endDate}`),
  ],
);

// A comp-off earned by working a holiday or an off day.
export const compOffCredits = pgTable(
  "comp_off_credits",
  {
    id: id(),
    employeeId: integer("employee_id").notNull().references(() => employees.id),
    earnedOn: date("earned_on").notNull(),
    reason: text("reason").notNull(),
  },
  (t) => [unique("comp_off_credits_once_per_day").on(t.employeeId, t.earnedOn)],
);

// ---------- The roster ----------

export const rosterStatus = pgEnum("roster_status", ["draft", "published"]);

export const rosters = pgTable(
  "rosters",
  {
    id: id(),
    month: date("month").notNull().unique(), // first day of the month
    status: rosterStatus("status").notNull().default("draft"),
    generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    // Written reason, needed when publishing with must-fix problems open.
    overrideReason: text("override_reason"),
  },
  (t) => [
    check("rosters_first_of_month", sql`extract(day from ${t.month}) = 1`),
    check("rosters_published_at", sql`(${t.status} = 'published') = (${t.publishedAt} is not null)`),
  ],
);

export const dayStatus = pgEnum("day_status", [
  "working",
  "weekly_off",
  "holiday",
  "leave",
  "comp_off",
  "unavailable",
]);

// One employee on one date.
export const rosterDays = pgTable(
  "roster_days",
  {
    id: id(),
    rosterId: integer("roster_id").notNull().references(() => rosters.id, { onDelete: "cascade" }),
    employeeId: integer("employee_id").notNull().references(() => employees.id),
    date: date("date").notNull(),
    status: dayStatus("status").notNull(),
    // Edited by the manager, so automatic repair must not change it.
    isLocked: boolean("is_locked").notNull().default(false),
  },
  (t) => [
    unique("roster_days_once").on(t.rosterId, t.employeeId, t.date),
    index("roster_days_date_idx").on(t.rosterId, t.date),
  ],
);

// The work an employee covers on that date.
export const rosterDuties = pgTable(
  "roster_duties",
  {
    rosterDayId: integer("roster_day_id").notNull().references(() => rosterDays.id, { onDelete: "cascade" }),
    serviceId: integer("service_id").notNull().references(() => services.id),
    isBackup: boolean("is_backup").notNull().default(false),
  },
  (t) => [
    primaryKey({ columns: [t.rosterDayId, t.serviceId] }),
    index("roster_duties_service_idx").on(t.serviceId),
  ],
);

// History of what changed after a roster was made.
export const rosterChanges = pgTable(
  "roster_changes",
  {
    id: id(),
    rosterId: integer("roster_id").notNull().references(() => rosters.id, { onDelete: "cascade" }),
    summary: text("summary").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("roster_changes_roster_idx").on(t.rosterId, t.createdAt)],
);
