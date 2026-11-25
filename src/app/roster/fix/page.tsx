import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { saveFix } from "@/app/roster/actions";
import { ChangeForm } from "@/components/change-form";
import { FixChoices } from "@/components/change-preview";
import { suggestFixes } from "@/engine/change";
import { checkRoster } from "@/engine/check";
import { planNothing } from "@/lib/change-request";
import { isMonth } from "@/lib/months";

export const maxDuration = 60;

export default async function FixPage({ searchParams }: PageProps<"/roster/fix">) {
  await connection();
  const { month, service, date } = await searchParams;
  if (typeof month !== "string" || !isMonth(month) || typeof date !== "string") notFound();
  const change = await planNothing(month);
  const target = change?.names.services.find((s) => String(s.id) === service);
  if (!change || !target) notFound();
  const { input, days } = change.after;
  const issue = checkRoster(input, days).find((i) => ["no_cover", "short_staffed"].includes(i.code) && i.date === date && i.serviceIds[0] === target.id);
  const fixes = issue ? suggestFixes(input, days, target, date) : [];

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4">
      <div>
        <Link href={`/roster?month=${month}&view=problems`} className="text-sm text-accent underline">Back to problems</Link>
        <h1 className="mt-1 text-2xl font-semibold">Find a fix</h1>
        <p className="text-sm text-muted">Every option was checked: none breaks another must-fix rule. Each fills one place.</p>
      </div>
      {!issue ? (
        <p className="panel p-4 text-sm">This gap is already covered.</p>
      ) : fixes.length === 0 ? (
        <FixChoices issue={issue} fixes={fixes} />
      ) : (
        <ChangeForm action={saveFix.bind(null, month)} submitLabel="Apply this fix">
          <FixChoices issue={issue} fixes={fixes} preselect />
        </ChangeForm>
      )}
    </div>
  );
}
