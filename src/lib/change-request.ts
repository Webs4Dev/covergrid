// Works out what a requested change would do. Used twice: to show the preview, and
// again when saving, so a saved change always matches the current data.
import { loadInput, loadRoster, loadTimeOff, monthsWithRoster, type RosterData, type SavedRoster } from "@/db/roster";
import { applyFixes, changedDays, repair } from "@/engine/change";
import type { CheckInput } from "@/engine/check";
import type { RosterDay } from "@/engine/types";
import { holidayCredits } from "./publish";

export const EDITABLE = ["working", "weekly_off", "holiday"] as const;
export type EditableStatus = (typeof EDITABLE)[number];
export const DECISIONS = { approve: "approved", reject: "rejected", cancel: "cancelled" } as const;
export type Decision = keyof typeof DECISIONS;

export type MonthChange = {
  month: string;
  roster: SavedRoster;
  names: RosterData;
  before: { input: CheckInput; days: RosterDay[] };
  after: { input: CheckInput; days: RosterDay[] };
};

async function loadMonth(month: string) {
  const [input, roster] = await Promise.all([loadInput(month), loadRoster(month)]);
  return roster ? { input, roster } : null;
}

export async function planEdit(month: string, employeeId: number, date: string, status: EditableStatus, serviceIds: number[]): Promise<MonthChange | null> {
  const loaded = await loadMonth(month);
  const employee = loaded?.input.employees.find((e) => e.id === employeeId);
  if (!loaded || !employee || !date.startsWith(`${month}-`)) return null;
  const { input, roster } = loaded;
  const current = roster.days.find((d) => d.employeeId === employeeId && d.date === date);
  const duties = input.assignments
    .filter((a) => a.employeeId === employeeId && serviceIds.includes(a.serviceId))
    .map((a) => ({ serviceId: a.serviceId, isBackup: a.role === "backup" }))
    .sort((a, b) => a.serviceId - b.serviceId);
  const next: RosterDay = { employeeId, date, status, duties: status === "working" ? duties : [], locked: true };
  const days = current ? roster.days.map((d) => (d === current ? next : d)) : [...roster.days, next];
  return { month, roster, names: input, before: { input, days: roster.days }, after: { input, days } };
}

export async function planRepair(month: string): Promise<MonthChange | null> {
  const loaded = await loadMonth(month);
  if (!loaded) return null;
  const { input, roster } = loaded;
  return { month, roster, names: input, before: { input, days: roster.days }, after: { input, days: repair(input, roster.days) } };
}

/** The current roster as it is, as a starting point for choosing a fix. */
export async function planNothing(month: string): Promise<MonthChange | null> {
  const loaded = await loadMonth(month);
  if (!loaded) return null;
  const { input, roster } = loaded;
  return { month, roster, names: input, before: { input, days: roster.days }, after: { input, days: roster.days } };
}

export async function planDecision(id: number, decision: Decision) {
  const entry = await loadTimeOff(id);
  if (!entry) return null;
  const from = decision === "cancel" ? ("approved" as const) : ("requested" as const);
  if (entry.status !== from) return { entry, from, months: null };
  const months: MonthChange[] = [];
  // A rejected request never affected a roster, so there is nothing to work out.
  if (decision !== "reject") {
    for (const month of await monthsWithRoster(entry.startDate, entry.endDate)) {
      const loaded = await loadMonth(month);
      if (!loaded) continue;
      const { input, roster } = loaded;
      const using = { ...input, timeOff: input.timeOff.map((t) => (t.id === id ? { ...t, status: DECISIONS[decision] } : t)) };
      months.push({ month, roster, names: input, before: { input, days: roster.days }, after: { input: using, days: repair(using, roster.days) } });
    }
  }
  return { entry, from, months };
}

/** The finished update for one month with the chosen fixes, or null if a fix no longer works. */
export function finish(change: MonthChange, fixKeys: string[], summary: string) {
  const mine = fixKeys.filter((key) => key.split(".")[2]?.startsWith(`${change.month}-`));
  const done = applyFixes(change.after.input, change.after.days, mine);
  if (!done) return null;
  return {
    month: change.month,
    roster: change.roster,
    changes: changedDays(change.roster.days, done.days),
    newAssignments: done.newAssignments,
    credits: holidayCredits(change.names, done.days),
    summary: [summary, ...done.labels].join(". "),
  };
}
