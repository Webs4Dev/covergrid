"use server";

// Public on purpose, like the other actions: see src/app/actions.ts.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { FormState } from "@/app/actions";
import { saveChanges } from "@/db/roster";
import { DECISIONS, EDITABLE, finish, planDecision, planEdit, planNothing, planRepair, type Decision, type EditableStatus } from "@/lib/change-request";
import { isMonth } from "@/lib/months";

const OUTDATED = "A fix you chose no longer works because the data changed. Reload the page and choose again.";
const FAILED = "The change could not be saved. Nothing was changed.";
const GONE = "This roster or entry no longer exists. Go back and try again.";

const fixesFrom = (form: FormData) =>
  [...form].filter(([name, value]) => name.startsWith("fix-") && value !== "").map(([, value]) => String(value)).slice(0, 60);

export async function saveEdit(month: string, employeeId: number, date: string, status: string, serviceIds: number[], _: FormState, form: FormData): Promise<FormState> {
  if (!isMonth(month) || !EDITABLE.includes(status as EditableStatus)) return { message: GONE };
  try {
    const change = await planEdit(month, employeeId, date, status as EditableStatus, serviceIds);
    if (!change) return { message: GONE };
    const name = change.names.employees.find((e) => e.id === employeeId)!.name;
    const update = finish(change, fixesFrom(form), `${name} on ${date} edited by hand: ${status.replace("_", " ")}`);
    if (!update) return { message: OUTDATED };
    await saveChanges([update]);
  } catch {
    console.error("Saving an edit failed.");
    return { message: FAILED };
  }
  revalidatePath("/", "layout");
  redirect(`/roster?month=${month}&view=day&date=${date}&done=saved`);
}

export async function saveRepair(month: string, _: FormState, form: FormData): Promise<FormState> {
  if (!isMonth(month)) return { message: GONE };
  try {
    const change = await planRepair(month);
    if (!change) return { message: GONE };
    const update = finish(change, fixesFrom(form), "Repaired after data changes");
    if (!update) return { message: OUTDATED };
    await saveChanges([update]);
  } catch {
    console.error("Repair failed.");
    return { message: FAILED };
  }
  revalidatePath("/", "layout");
  redirect(`/roster?month=${month}&view=problems&done=repaired`);
}

export async function saveFix(month: string, _: FormState, form: FormData): Promise<FormState> {
  if (!isMonth(month)) return { message: GONE };
  const keys = fixesFrom(form);
  if (keys.length === 0) return { message: "Choose a fix first." };
  try {
    const change = await planNothing(month);
    if (!change) return { message: GONE };
    const update = finish(change, keys, `Gap on ${keys[0].split(".")[2] ?? ""} fixed`);
    if (!update) return { message: OUTDATED };
    await saveChanges([update]);
  } catch {
    console.error("Saving a fix failed.");
    return { message: FAILED };
  }
  revalidatePath("/", "layout");
  redirect(`/roster?month=${month}&view=problems&done=fixed`);
}

export async function saveDecision(id: number, decision: Decision, _: FormState, form: FormData): Promise<FormState> {
  if (!Object.hasOwn(DECISIONS, decision)) return { message: GONE };
  try {
    const plan = await planDecision(id, decision);
    if (!plan) return { message: GONE };
    if (!plan.months) return { message: "Someone already decided on this entry. Reload the page." };
    const keys = fixesFrom(form);
    const name = plan.months[0]?.names.employees.find((e) => e.id === plan.entry.employeeId)?.name ?? "Employee";
    const summary = `${name}: ${plan.entry.kind.replace("_", "-")} ${plan.entry.startDate} to ${plan.entry.endDate} ${DECISIONS[decision]}`;
    const updates = plan.months.map((m) => finish(m, keys, summary));
    const ready = updates.filter((u) => u !== null);
    if (ready.length !== updates.length) return { message: OUTDATED };
    await saveChanges(ready, { id, from: plan.from, to: DECISIONS[decision] });
  } catch {
    console.error("Saving a decision failed.");
    return { message: FAILED };
  }
  revalidatePath("/", "layout");
  redirect(`/roster/leave?id=${id}&done=1`);
}
