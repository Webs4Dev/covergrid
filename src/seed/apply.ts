import { sql } from "drizzle-orm";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import * as t from "../db/schema.ts";
import * as data from "./data.ts";

// Wipes every table and loads the sample data in ONE transaction: if anything
// fails, the old data stays.
export async function resetToSampleData(db: NeonHttpDatabase) {
  const fixSequence = (table: string) =>
    db.execute(sql.raw(`select setval(pg_get_serial_sequence('${table}', 'id'), (select max(id) from ${table}))`));

  await db.batch([
    db.execute(sql`truncate pods, employees, processes, operating_calendars, shifts, holidays, brands,
      services, staffing_rules, assignments, time_off, comp_off_credits, rosters, roster_days,
      roster_duties, roster_changes restart identity`),
    // Pods and employees point at each other, so leads are set after both exist.
    db.insert(t.pods).overridingSystemValue().values(data.pods.map(({ id, name }) => ({ id, name }))),
    db.insert(t.employees).overridingSystemValue().values(data.employees),
    db.execute(sql`update pods set lead_id = v.lead_id from (values ${sql.join(
      data.pods.map((p) => sql`(${p.id}::int, ${p.leadId}::int)`),
      sql`, `,
    )}) as v(id, lead_id) where pods.id = v.id`),
    db.insert(t.processes).overridingSystemValue().values(data.processes),
    db.insert(t.operatingCalendars).overridingSystemValue().values(data.calendars),
    db.insert(t.shifts).overridingSystemValue().values(data.shifts),
    db.insert(t.holidays).values(data.holidays),
    db.insert(t.brands).overridingSystemValue().values(data.brands),
    db.insert(t.services).overridingSystemValue().values(data.services),
    db.insert(t.staffingRules).values(data.staffingRules),
    db.insert(t.assignments).values(data.assignments),
    db.insert(t.timeOff).values(data.timeOff),
    db.insert(t.compOffCredits).values(data.compOffCredits),
    // Ids above were set by hand, so tell the counters where to continue.
    fixSequence("pods"),
    fixSequence("employees"),
    fixSequence("processes"),
    fixSequence("operating_calendars"),
    fixSequence("shifts"),
    fixSequence("brands"),
    fixSequence("services"),
  ]);
}
