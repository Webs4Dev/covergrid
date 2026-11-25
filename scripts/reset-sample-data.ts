// Deletes everything in the database and loads the sample data: npm run db:reset
import nextEnv from "@next/env";
import { neon } from "@neondatabase/serverless";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import { resetToSampleData } from "../src/seed/apply.ts";

nextEnv.loadEnvConfig(process.cwd());

try {
  const db = drizzle({ client: neon(process.env.DATABASE_URL ?? "") });
  await resetToSampleData(db);
  const { rows } = await db.execute(sql`select
    (select count(*) from pods where lead_id is not null) as pods_with_lead,
    (select count(*) from employees) as employees,
    (select count(*) from brands) as brands,
    (select count(*) from services) as services,
    (select count(*) from assignments) as assignments,
    (select count(*) from staffing_rules) as staffing_rules,
    (select count(*) from time_off) as time_off,
    (select count(*) from holidays) as holidays,
    (select count(*) from comp_off_credits) as comp_off_credits`);
  console.log("Sample data loaded:", rows[0]);
} catch (error) {
  // Hide anything that looks like a connection string.
  const cause = (error as { cause?: unknown }).cause ?? error;
  console.error("Reset failed:", String(cause).replace(/postgres(ql)?:\/\/\S+/g, "[hidden]").slice(0, 400));
  process.exitCode = 1;
}
