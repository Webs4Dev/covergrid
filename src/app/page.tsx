import { sql } from "drizzle-orm";
import { connection } from "next/server";
import { getDb } from "@/db";

async function isDatabaseReady() {
  try {
    await getDb().execute(sql`select 1`);
    return true;
  } catch {
    // Error details can contain connection info, so they are not logged or shown.
    console.error("Database check failed. Check DATABASE_URL.");
    return false;
  }
}

export default async function Home() {
  await connection();
  const ready = await isDatabaseReady();

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
      <h1 className="text-4xl font-semibold">CoverGrid</h1>
      <p>Smart roster management</p>
      <p role="status">{ready ? "Database connected" : "Database not connected"}</p>
    </main>
  );
}
