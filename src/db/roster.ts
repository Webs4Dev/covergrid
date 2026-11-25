// Loads everything the roster logic needs, and saves or reads monthly rosters. Server only.
import { and, between, eq, sql } from "drizzle-orm";
import type { CheckInput } from "@/engine/check";
import { addDays, monthDates, weekOf } from "@/engine/dates";
import type { DayStatus, RosterDay } from "@/engine/types";
import { getDb } from "./index";
import * as t from "./schema";

const firstOf = (month: string) => `${month}-01`;

export type SavedRoster = { id: number; status: "draft" | "published"; generatedAt: Date; days: RosterDay[] };

async function daysBetween(rosterId: number, from: string, to: string): Promise<RosterDay[]> {
  const db = getDb();
  const inRange = and(eq(t.rosterDays.rosterId, rosterId), between(t.rosterDays.date, from, to));
  const [days, duties] = await Promise.all([
    db.select().from(t.rosterDays).where(inRange),
    db
      .select({ dayId: t.rosterDuties.rosterDayId, serviceId: t.rosterDuties.serviceId, isBackup: t.rosterDuties.isBackup })
      .from(t.rosterDuties)
      .innerJoin(t.rosterDays, eq(t.rosterDays.id, t.rosterDuties.rosterDayId))
      .where(inRange),
  ]);
  const byDay = new Map<number, RosterDay["duties"]>();
  for (const { dayId, serviceId, isBackup } of duties) {
    byDay.set(dayId, [...(byDay.get(dayId) ?? []), { serviceId, isBackup }]);
  }
  return days.map((d) => ({ employeeId: d.employeeId, date: d.date, status: d.status as DayStatus, duties: byDay.get(d.id) ?? [] }));
}

/** The roster data plus the names the screens show. */
export type RosterData = Omit<CheckInput, "pods" | "processes"> & {
  pods: { id: number; name: string; leadId: number | null }[];
  processes: { id: number; code: string; name: string }[];
};

/** Active data only: anything switched off is left out of rosters. */
export async function loadInput(month: string): Promise<RosterData> {
  const db = getDb();
  const [employees, pods, brands, services, processes, calendars, shifts, holidays, staffingRules, assignments, timeOff, compOffCredits] =
    await db.batch([
      db.select().from(t.employees).where(eq(t.employees.isActive, true)).orderBy(t.employees.id),
      db.select().from(t.pods).orderBy(t.pods.id),
      db.select().from(t.brands).where(eq(t.brands.isActive, true)).orderBy(t.brands.id),
      db.select().from(t.services).where(eq(t.services.isActive, true)).orderBy(t.services.id),
      db.select().from(t.processes).orderBy(t.processes.id),
      db.select().from(t.operatingCalendars),
      db.select().from(t.shifts),
      db.select().from(t.holidays),
      db.select().from(t.staffingRules),
      db.select().from(t.assignments),
      db.select().from(t.timeOff),
      db.select().from(t.compOffCredits),
    ]);

  const brandIds = new Set(brands.map((b) => b.id));
  const processIds = new Set(processes.filter((p) => p.isActive).map((p) => p.id));
  const live = services.filter((s) => brandIds.has(s.brandId) && processIds.has(s.processId));
  const serviceIds = new Set(live.map((s) => s.id));
  const employeeIds = new Set(employees.map((e) => e.id));

  // The previous roster's days in the week this month starts in.
  const monday = weekOf(firstOf(month))[0];
  let history: RosterDay[] = [];
  if (monday < firstOf(month)) {
    const [previous] = await db.select().from(t.rosters).where(eq(t.rosters.month, firstOf(monday.slice(0, 7))));
    if (previous) history = await daysBetween(previous.id, monday, addDays(firstOf(month), -1));
  }

  return {
    month,
    employees,
    pods,
    brands,
    services: live,
    processes,
    calendars,
    shifts,
    holidays,
    staffingRules,
    assignments: assignments.filter((a) => employeeIds.has(a.employeeId) && serviceIds.has(a.serviceId)),
    timeOff,
    compOffCredits,
    history,
  };
}

export async function loadRoster(month: string): Promise<SavedRoster | null> {
  const [roster] = await getDb().select().from(t.rosters).where(eq(t.rosters.month, firstOf(month)));
  if (!roster) return null;
  const dates = monthDates(month);
  const days = await daysBetween(roster.id, dates[0], dates[dates.length - 1]);
  return { id: roster.id, status: roster.status, generatedAt: roster.generatedAt, days };
}

/** Replaces the month's draft in one transaction, so a failure keeps the old one. */
export async function saveRoster(month: string, days: RosterDay[]) {
  const db = getDb();
  const rosterId = sql`(select id from rosters where month = ${firstOf(month)})`;
  const duties = days.flatMap((d) => d.duties.map((duty) => ({ ...duty, employeeId: d.employeeId, date: d.date })));

  await db.batch([
    db.delete(t.rosters).where(and(eq(t.rosters.month, firstOf(month)), eq(t.rosters.status, "draft"))),
    // Fails on the unique month if a published roster exists, which undoes the batch.
    db.insert(t.rosters).values({ month: firstOf(month) }),
    ...(days.length === 0
      ? []
      : [db.insert(t.rosterDays).values(days.map((d) => ({
          rosterId, employeeId: d.employeeId, date: d.date, status: d.status,
        })))]),
    // Duties need the new day ids, so they are matched by person and date.
    ...(duties.length === 0
      ? []
      : [db.execute(sql`insert into roster_duties (roster_day_id, service_id, is_backup)
          select d.id, v.service_id, v.is_backup
          from json_to_recordset(${JSON.stringify(duties.map((x) => ({
            employee_id: x.employeeId, date: x.date, service_id: x.serviceId, is_backup: x.isBackup,
          })))}::json) as v(employee_id int, date date, service_id int, is_backup boolean)
          join roster_days d on d.roster_id = ${rosterId} and d.employee_id = v.employee_id and d.date = v.date`)]),
  ]);
}
