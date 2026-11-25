import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "@/components/icon";
import { connection } from "next/server";
import { saveDecision } from "@/app/roster/actions";
import { ChangeForm } from "@/components/change-form";
import { ChangePreview, namesOf, showDate } from "@/components/change-preview";
import { getDb } from "@/db";
import { employees } from "@/db/schema";
import { describeChange, otherLeaveDates } from "@/engine/change";
import { planDecision } from "@/lib/change-request";
import { monthLabel } from "@/lib/months";

export const maxDuration = 60;

export default async function LeavePage({ searchParams }: PageProps<"/roster/leave">) {
  await connection();
  const { id, done } = await searchParams;
  if (typeof id !== "string" || !/^\d{1,9}$/.test(id)) notFound();
  const first = await planDecision(Number(id), "approve");
  if (!first) notFound();
  const { entry } = first;
  const [person] = await getDb().select().from(employees).where(eq(employees.id, entry.employeeId));
  const decision = entry.status === "approved" ? "cancel" : "approve";
  const plan = entry.status === "approved" ? await planDecision(Number(id), "cancel") : first;
  const months = (plan?.months ?? []).map((m) => ({ ...m, plan: describeChange(m.before, m.after) }));
  const open = months.reduce((n, m) => n + m.plan.gaps.length, 0);
  const other = entry.status === "requested" && open > 0 && months.length === 1
    ? otherLeaveDates(months[0].before.input, months[0].before.days, entry)
    : [];
  const kind = { leave: "Leave", comp_off: "Comp-off", unavailable: "Unavailable" }[entry.kind];
  const range = entry.startDate === entry.endDate ? showDate(entry.startDate) : `${showDate(entry.startDate)} to ${showDate(entry.endDate)}`;

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4">
      <div>
        <Link href="/manage/time-off" className="btn-sm"><Icon name="back" />Back to time off</Link>
        <h1 className="mt-3 text-2xl font-semibold">{person?.name}: {kind.toLowerCase()}, {range}</h1>
        <dl className="panel mt-3 flex flex-wrap items-start gap-x-10 gap-y-3 p-4">
          <div>
            <dt className="text-xs text-muted">Reason for {kind.toLowerCase()}</dt>
            <dd className="mt-0.5 text-base font-semibold">{entry.reason || "No reason given"}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Status</dt>
            <dd className="mt-1">
              <span className={`tag ${entry.status === "requested" ? "text-accent" : "text-ink"}`}>
                {entry.status[0].toUpperCase() + entry.status.slice(1)}
              </span>
            </dd>
          </div>
        </dl>
      </div>
      {done && <p role="status" className="rounded-md bg-accent-soft px-3 py-2 text-sm">Saved. This entry is now {entry.status}.</p>}

      {entry.status === "rejected" || entry.status === "cancelled" ? (
        <p className="panel p-4 text-sm">This entry does not affect any roster. To reopen it, edit it under Time off.</p>
      ) : (
        <>
          <section className="space-y-4">
            <h2 className="text-lg font-semibold">{decision === "approve" ? "If you approve this" : "If you cancel this"}</h2>
            <ChangeForm
              key={entry.status}
              action={saveDecision.bind(null, entry.id, decision)}
              danger={decision === "cancel"}
              submitLabel={decision === "cancel" ? "Cancel this time off" : "Approve with these choices"}
            >
              {months.length === 0 && <p className="panel p-4 text-sm">No roster exists for these dates yet. The next one generated will take this into account.</p>}
              {months.map((m) => (
                <div key={m.month} className="space-y-2">
                  <p className="text-sm text-muted">{monthLabel(m.month)}, {m.roster.status}{m.roster.status === "published" ? ". The change will be recorded in its history." : ""}</p>
                  <ChangePreview plan={m.plan} names={namesOf(m.names)} />
                </div>
              ))}
              {other.length > 0 && (
                <p className="rounded-md bg-accent-soft px-3 py-2 text-sm">
                  Nearby dates with no new must-fix problem: {other.map((o) => (o.startDate === o.endDate ? showDate(o.startDate) : `${showDate(o.startDate)} to ${showDate(o.endDate)}`)).join("; ")}.
                </p>
              )}
            </ChangeForm>
          </section>
          {entry.status === "requested" && (
            <section>
              <h2 className="mb-2 text-lg font-semibold">Or turn it down</h2>
              <ChangeForm action={saveDecision.bind(null, entry.id, "reject")} submitLabel="Reject request" danger />
            </section>
          )}
        </>
      )}
    </div>
  );
}
