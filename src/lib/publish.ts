// The rules for publishing a roster. Pure functions, so they can be tested.
import { canPublish, type Issue } from "../engine/check.ts";
import type { RosterDay } from "../engine/types.ts";

export const REASON_MIN = 10;
export const REASON_MAX = 300;
/** Marks comp-off credits that publishing created, so unpublishing can remove them. */
export const CREDIT_PREFIX = "Roster: worked on ";

/** What is wrong with publishing now, or null if it may go ahead. */
export function publishProblem(issues: Issue[], reason: string): string | null {
  if (reason.length > REASON_MAX) return `Keep the reason under ${REASON_MAX} characters.`;
  if (!canPublish(issues) && reason.length < REASON_MIN) {
    return `There are must-fix problems. Fix them, or write why you are publishing anyway (at least ${REASON_MIN} characters).`;
  }
  return null;
}

/** Working a public holiday earns one comp-off. */
export function holidayCredits(input: { holidays: { date: string; name: string }[] }, days: RosterDay[]) {
  const names = new Map(input.holidays.map((h) => [h.date, h.name]));
  return days
    .filter((d) => d.status === "working" && d.duties.length > 0 && names.has(d.date))
    .map((d) => ({ employeeId: d.employeeId, earnedOn: d.date, reason: CREDIT_PREFIX + names.get(d.date) }));
}
