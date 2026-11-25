// Loads everything the roster logic needs, and saves or reads monthly rosters. Server only.
import type { BatchItem } from "drizzle-orm/batch";
import { and, between, desc, eq, like, sql } from "drizzle-orm";
import type { CheckInput } from "@/engine/check";
import { addDays, monthDates, weekOf } from "@/engine/dates";
import type { DayChange } from "@/engine/change";
import type { Assignment, DayStatus, RosterDay, TimeOff } from "@/engine/types";
import { CREDIT_PREFIX } from "@/lib/publish";
import { getDb } from "./index";
import * as t from "./schema";

const firstOf = (month: string) => `${month}-01`;

export type SavedRoster = {
  id: number;
  status: "draft" | "published";
  generatedAt: Date;
  publishedAt: Date | null;
  overrideReason: string | null;
  days: RosterDay[];
};

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
  return days.map((d) => ({ employeeId: d.employeeId, date: d.date, status: d.status as DayStatus, duties: byDay.get(d.id) ?? [], locked: d.isLocked }));
}

/** The roster data plus the names the screens show. */
export type RosterData = Omit<CheckInput, "pods" | "processes" | "holidays" | "timeOff"> & {
  timeOff: (TimeOff & { id: number; reason: string | null })[];
  holidays: { date: string; name: string }[];
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
  const { id, status, generatedAt, publishedAt, overrideReason } = roster;
  return { id, status, generatedAt, publishedAt, overrideReason, days };
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

export async function loadChanges(rosterId: number) {
  return getDb().select().from(t.rosterChanges).where(eq(t.rosterChanges.rosterId, rosterId))
    .orderBy(desc(t.rosterChanges.createdAt), desc(t.rosterChanges.id)).limit(10);
}

type Credit = { employeeId: number; earnedOn: string; reason: string };

export async function markPublished(rosterId: number, reason: string | null, credits: Credit[]) {
  const db = getDb();
  await db.batch([
    db.update(t.rosters).set({ status: "published", publishedAt: new Date(), overrideReason: reason })
      .where(eq(t.rosters.id, rosterId)),
    db.insert(t.rosterChanges).values({
      rosterId, summary: reason ? `Published with open problems: ${reason}` : "Published",
    }),
    // A day that already earned a credit does not earn a second one.
    ...(credits.length ? [db.insert(t.compOffCredits).values(credits).onConflictDoNothing()] : []),
  ]);
}

export async function markDraft(rosterId: number, month: string) {
  const db = getDb();
  const dates = monthDates(month);
  await db.batch([
    db.update(t.rosters).set({ status: "draft", publishedAt: null, overrideReason: null }).where(eq(t.rosters.id, rosterId)),
    db.insert(t.rosterChanges).values({ rosterId, summary: "Returned to draft" }),
    db.delete(t.compOffCredits).where(and(
      like(t.compOffCredits.reason, `${CREDIT_PREFIX}%`),
      between(t.compOffCredits.earnedOn, dates[0], dates[dates.length - 1]),
    )),
  ]);
}

/** Months from a list that already have a roster. */
export async function monthsWithRoster(from: string, to: string) {
  const rows = await getDb().select({ month: t.rosters.month }).from(t.rosters)
    .where(between(t.rosters.month, firstOf(from.slice(0, 7)), firstOf(to.slice(0, 7)))).orderBy(t.rosters.month);
  return rows.map((r) => r.month.slice(0, 7));
}

export async function loadTimeOff(id: number) {
  const [row] = await getDb().select().from(t.timeOff).where(eq(t.timeOff.id, id));
  return row ?? null;
}

export type RosterUpdate = {
  month: string;
  roster: SavedRoster;
  changes: DayChange[];
  newAssignments: Assignment[];
  credits: Credit[]; // holiday comp-offs, used only if the roster is published
  summary: string;
};

type TimeOffUpdate = { id: number; from: "requested" | "approved"; to: "approved" | "rejected" | "cancelled" };

/** Saves changed days (and a leave decision) in one transaction: all of it or none. */
export async function saveChanges(updates: RosterUpdate[], timeOff?: TimeOffUpdate) {
  const db = getDb();
  const queries = updates.flatMap(({ month, roster, changes, newAssignments, credits, summary }) => {
    const gone = changes.filter((c) => !c.after).map((c) => ({ employee_id: c.before!.employeeId, date: c.before!.date }));
    const kept = changes.flatMap((c) => (c.after ? [c.after] : []));
    const rows = kept.map((d) => ({ employee_id: d.employeeId, date: d.date, status: d.status, is_locked: Boolean(d.locked) }));
    const duties = kept.flatMap((d) => d.duties.map((x) => ({ employee_id: d.employeeId, date: d.date, service_id: x.serviceId, is_backup: x.isBackup })));
    const dates = monthDates(month);
    const list: BatchItem<"pg">[] = [
      ...(gone.length ? [db.execute(sql`delete from roster_days d
        using json_to_recordset(${JSON.stringify(gone)}::json) as v(employee_id int, date date)
        where d.roster_id = ${roster.id} and d.employee_id = v.employee_id and d.date = v.date`)] : []),
      ...(rows.length ? [
        db.execute(sql`insert into roster_days (roster_id, employee_id, date, status, is_locked)
          select ${roster.id}::int, v.employee_id, v.date, v.status::day_status, v.is_locked
          from json_to_recordset(${JSON.stringify(rows)}::json) as v(employee_id int, date date, status text, is_locked boolean)
          on conflict (roster_id, employee_id, date) do update set status = excluded.status, is_locked = excluded.is_locked`),
        db.execute(sql`delete from roster_duties u using roster_days d,
          json_to_recordset(${JSON.stringify(rows)}::json) as v(employee_id int, date date)
          where u.roster_day_id = d.id and d.roster_id = ${roster.id} and d.employee_id = v.employee_id and d.date = v.date`),
      ] : []),
      ...(newAssignments.length ? [db.insert(t.assignments).values(newAssignments).onConflictDoNothing()] : []),
      ...(duties.length ? [db.execute(sql`insert into roster_duties (roster_day_id, service_id, is_backup)
        select d.id, v.service_id, v.is_backup
        from json_to_recordset(${JSON.stringify(duties)}::json) as v(employee_id int, date date, service_id int, is_backup boolean)
        join roster_days d on d.roster_id = ${roster.id} and d.employee_id = v.employee_id and d.date = v.date`)] : []),
      db.insert(t.rosterChanges).values({ rosterId: roster.id, summary: summary.slice(0, 500) }),
    ];
    if (roster.status === "published") {
      list.push(
        db.delete(t.compOffCredits).where(and(
          like(t.compOffCredits.reason, `${CREDIT_PREFIX}%`),
          between(t.compOffCredits.earnedOn, dates[0], dates[dates.length - 1]),
        )),
        ...(credits.length ? [db.insert(t.compOffCredits).values(credits).onConflictDoNothing()] : []),
      );
    }
    return list;
  });
  // Only changes the decision the manager was looking at; a newer one is left alone.
  const decision = timeOff
    ? [db.update(t.timeOff).set({ status: timeOff.to }).where(and(eq(t.timeOff.id, timeOff.id), eq(t.timeOff.status, timeOff.from)))]
    : [];
  const [head, ...tail]: BatchItem<"pg">[] = [...decision, ...queries];
  if (head) await db.batch([head, ...tail]);
}
