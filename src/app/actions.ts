"use server";

// These actions are public on purpose: the demo has no login, holds only fictional
// data and can be restored with the reset button. Every input is still validated.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { deleteRow, saveRow } from "@/db/admin";
import { isEntityName } from "@/lib/entities";
import { parseForm, type Errors } from "@/lib/parse";
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
