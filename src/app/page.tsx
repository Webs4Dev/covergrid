import { sql } from "drizzle-orm";
import Link from "next/link";
import { connection } from "next/server";
import { reset } from "@/app/actions";
import { ConfirmButton } from "@/components/confirm-button";
import { getDb } from "@/db";
import { checkDatabase } from "@/db/check";

async function loadCounts() {
  const { rows } = await getDb().execute(sql`select
    (select count(*) from employees where is_active) as employees,
    (select count(*) from pods where is_active) as pods,
    (select count(*) from brands where is_active) as brands,
    (select count(*) from services where is_active) as services,
    (select count(*) from time_off where status = 'requested') as requests`);
  return rows[0] as Record<string, string>;
}

export default async function Home({ searchParams }: PageProps<"/">) {
  await connection();
  const { done } = await searchParams;
  const problem = await checkDatabase();

  if (problem) {
    console.error(`Database check failed: ${problem}`);
    return (
      <div role="alert">
        <h1 className="text-2xl font-semibold">Database not connected</h1>
        <p className="mt-2 text-muted">
          {process.env.NODE_ENV === "development" ? problem : "Please try again in a minute."}
        </p>
      </div>
    );
  }

  const counts = await loadCounts();
  const tiles = [
    { label: "Employees", value: counts.employees, href: "/manage/employees" },
    { label: "Pods", value: counts.pods, href: "/manage/pods" },
    { label: "Brands", value: counts.brands, href: "/manage/brands" },
    { label: "Brand processes", value: counts.services, href: "/manage/services" },
    { label: "Leave requests waiting", value: counts.requests, href: "/manage/time-off" },
  ];

  return (
    <div className="max-w-5xl">
      <h1 className="text-2xl font-semibold">Overview</h1>
      <p className="mt-1 text-sm text-muted">Plan, check and manage monthly rosters across brands, processes and pods.</p>
      {done === "reset" && (
        <p role="status" className="mt-4 rounded-md bg-accent-soft px-3 py-2 text-sm">Sample data restored.</p>
      )}

      <ul className="panel mt-6 grid grid-cols-2 sm:grid-cols-5">
        {tiles.map((tile) => (
          <li key={tile.label}>
            <Link href={tile.href} className="block h-full p-4 hover:bg-accent-soft">
              <span className="block text-2xl font-semibold tabular-nums">{tile.value}</span>
              <span className="text-sm text-muted">{tile.label}</span>
            </Link>
          </li>
        ))}
      </ul>

      <section className="panel mt-6 p-4">
        <h2 className="text-lg font-semibold">Sample data</h2>
        <p className="mt-1 mb-3 text-sm text-muted">
          This demo uses fictional data that anyone can edit. Restore it to start again.
        </p>
        <ConfirmButton
          label="Reset sample data"
          confirmLabel="Yes, reset"
          note="Deletes every change and saved roster, then loads the sample data again."
          action={reset}
        />
      </section>
    </div>
  );
}
