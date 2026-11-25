"use server";

// These actions are public on purpose: the demo has no login, holds only fictional
// data and can be restored with the reset button. Every input is still validated.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { deleteRow, saveRow } from "@/db/admin";
import { loadInput, loadRoster, markDraft, markPublished, saveRoster } from "@/db/roster";
import { checkRoster } from "@/engine/check";
import { generateRoster } from "@/engine/generate";
import { isEntityName } from "@/lib/entities";
import { isMonth } from "@/lib/months";
import { parseForm, type Errors } from "@/lib/parse";
import { holidayCredits, publishProblem } from "@/lib/publish";
import { resetToSampleData } from "@/seed/apply";

export type FormState = { message?: string; errors?: Errors; values?: Record<string, string[]> };

export async function save(entity: string, rowKey: string | null, _: FormState, form: FormData): Promise<FormState> {
  if (!isEntityName(entity)) return { message: "Unknown data type." };
  // Sent back after an error, so nothing the person typed is lost.
  const typed: Record<string, string[]> = {};
  for (const [key, value] of form) if (!key.startsWith("$")) (typed[key] ??= []).push(String(value));

  const { values, errors } = parseForm(entity, form);
  if (Object.keys(errors).length > 0) return { message: "Please fix the marked fields.", errors, values: typed };
  const result = await saveRow(entity, rowKey, values);
  if (!result.ok) return { message: result.message, errors: result.errors, values: typed };

  revalidatePath("/", "layout");
  redirect(`/manage/${entity}?done=${rowKey === null ? "added" : "saved"}`);
}

export async function remove(entity: string, rowKey: string): Promise<FormState> {
  if (!isEntityName(entity)) return { message: "Unknown data type." };
  const result = await deleteRow(entity, rowKey);
  if (!result.ok) return { message: result.message };
  revalidatePath("/", "layout");
  redirect(`/manage/${entity}?done=deleted`);
}

export async function reset(): Promise<FormState> {
  try {
    await resetToSampleData(getDb());
  } catch {
    console.error("Reset failed.");
    return { message: "Reset failed. Nothing was changed." };
  }
  revalidatePath("/", "layout");
  redirect("/?done=reset");
}

export async function generate(month: string): Promise<FormState> {
  if (!isMonth(month)) return { message: "Choose a month." };
  try {
    if ((await loadRoster(month))?.status === "published") {
      return { message: "This month is already published, so it cannot be replaced." };
    }
    await saveRoster(month, generateRoster(await loadInput(month)).days);
  } catch {
    console.error("Roster generation failed.");
    return { message: "The roster could not be generated. Nothing was changed." };
  }
  revalidatePath("/", "layout");
  redirect(`/roster?month=${month}`);
}

/** The roster is checked again here: what the screen showed may be out of date. */
export async function publish(month: string, _: FormState, form: FormData): Promise<FormState> {
  if (!isMonth(month)) return { message: "Choose a month." };
  const reason = String(form.get("reason") ?? "").trim();
  try {
    const [input, roster] = await Promise.all([loadInput(month), loadRoster(month)]);
    if (!roster) return { message: "Generate the roster first." };
    if (roster.status === "published") return { message: "This month is already published." };
    const issues = checkRoster(input, roster.days);
    const problem = publishProblem(issues, reason);
    if (problem) return { message: problem, values: { reason: [reason] } };
    const needsReason = issues.some((i) => i.severity === "must_fix");
    await markPublished(roster.id, needsReason ? reason : null, holidayCredits(input, roster.days));
  } catch {
    console.error("Publishing failed.");
    return { message: "The roster could not be published. Nothing was changed." };
  }
  revalidatePath("/", "layout");
  redirect(`/roster?month=${month}`);
}

export async function unpublish(month: string): Promise<FormState> {
  if (!isMonth(month)) return { message: "Choose a month." };
  try {
    const roster = await loadRoster(month);
    if (roster?.status !== "published") return { message: "This month is not published." };
    await markDraft(roster.id, month);
  } catch {
    console.error("Unpublishing failed.");
    return { message: "Could not return it to draft. Nothing was changed." };
  }
  revalidatePath("/", "layout");
  redirect(`/roster?month=${month}`);
}
