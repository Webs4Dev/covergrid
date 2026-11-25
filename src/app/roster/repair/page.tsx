import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "@/components/icon";
import { connection } from "next/server";
import { saveRepair } from "@/app/roster/actions";
import { ChangeForm } from "@/components/change-form";
import { ChangePreview, namesOf } from "@/components/change-preview";
import { describeChange } from "@/engine/change";
import { planRepair } from "@/lib/change-request";
import { isMonth, monthLabel } from "@/lib/months";

export const maxDuration = 60;

export default async function RepairPage({ searchParams }: PageProps<"/roster/repair">) {
  await connection();
  const { month } = await searchParams;
  if (typeof month !== "string" || !isMonth(month)) notFound();
  const change = await planRepair(month);
  if (!change) notFound();
  const plan = describeChange(change.before, change.after);

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4">
      <div>
        <Link href={`/roster?month=${month}`} className="btn-sm"><Icon name="back" />Back to the roster</Link>
        <h1 className="mt-3 text-2xl font-semibold">Repair {monthLabel(month)}</h1>
        <p className="text-sm text-muted">
          Brings the roster in line with the current data and fills gaps with approved backups. Weekly offs stay where they are, and days without a problem are not touched.
        </p>
      </div>
      {plan.changes.length === 0 ? (
        <p className="panel p-4 text-sm">Nothing to repair. Any problem still open needs a decision: see the Problems tab.</p>
      ) : (
        <ChangeForm action={saveRepair.bind(null, month)} submitLabel={`Apply ${plan.changes.length} changes`}>
          <ChangePreview plan={plan} names={namesOf(change.names)} />
        </ChangeForm>
      )}
    </div>
  );
}
