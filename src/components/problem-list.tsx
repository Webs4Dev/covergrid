import Link from "next/link";
import type { Issue } from "@/engine/check";

const day = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const formatDate = (date: string) => day.format(new Date(`${date}T00:00:00Z`));
const readable = (text: string) => text.replace(/\d{4}-\d\d-\d\d/g, formatDate);

type Props = {
  issues: Issue[];
  href: (params: Record<string, string | number>) => string;
  brandOfService: Map<number, number>;
};

/** Every problem with its reasons, must-fix first, each linked to where to look. */
export function ProblemList({ issues, href, brandOfService }: Props) {
  const section = (title: string, list: Issue[], mustFix: boolean) => (
    <section>
      <h2 className="mb-2 text-lg font-semibold">{title} ({list.length})</h2>
      {list.length === 0 && <p className="text-sm text-muted">None.</p>}
      <ul className="space-y-2">
        {list.map((issue, i) => (
          <li key={i} className={`rounded-[10px] border p-3 ${mustFix ? "border-danger/40 bg-danger-soft" : "border-warn/30 bg-warn-soft"}`}>
            <p className="text-sm font-medium">
              <span className={mustFix ? "text-danger" : "text-warn"}>{mustFix ? "Must fix" : "Preference"}</span>
              {issue.date && <span className="text-muted">, {formatDate(issue.date)}</span>}
              <span className="block">{readable(issue.message)}</span>
            </p>
            {issue.reasons.length > 0 && (
              <ul className="mt-1 list-disc pl-5 text-sm text-muted">
                {issue.reasons.map((r) => <li key={r}>{readable(r)}</li>)}
              </ul>
            )}
            <p className="mt-2 flex flex-wrap gap-2">
              {(issue.code === "no_cover" || issue.code === "short_staffed") && (
                <Link className="btn-sm btn-sm-primary" href={`/roster/fix?month=${issue.date!.slice(0, 7)}&service=${issue.serviceIds[0]}&date=${issue.date}`}>Find a fix</Link>
              )}
              {issue.date && <Link className="btn-sm" href={href({ view: "day", date: issue.date })}>See that day</Link>}
              {issue.employeeIds.length === 1 && (
                <Link className="btn-sm" href={href({ view: "employee", id: issue.employeeIds[0] })}>See the person</Link>
              )}
              {issue.serviceIds.length === 1 && brandOfService.has(issue.serviceIds[0]) && (
                <Link className="btn-sm" href={href({ view: "brand", id: brandOfService.get(issue.serviceIds[0])! })}>See the brand</Link>
              )}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );

  return (
    <div className="max-w-3xl space-y-6">
      {section("Must fix", issues.filter((i) => i.severity === "must_fix"), true)}
      {section("Preferences", issues.filter((i) => i.severity === "preference"), false)}
    </div>
  );
}
