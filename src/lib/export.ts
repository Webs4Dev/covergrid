// Builds the rows of each export, and turns rows into CSV. Pure functions.
import type { CheckInput } from "../engine/check.ts";
import type { DayStatus, RosterDay } from "../engine/types.ts";
import { createView } from "./roster-view.ts";

export const EXPORTS = {
  grid: "Month grid",
  duties: "Who does what",
  coverage: "Coverage",
} as const;
export type ExportKind = keyof typeof EXPORTS;
export type Cell = string | number;

type ExportInput = Omit<CheckInput, "pods"> & { pods: { id: number; name: string; leadId: number | null }[] };

const SHORT: Record<DayStatus, string> = {
  working: "Work", weekly_off: "Off", holiday: "Holiday", leave: "Leave", comp_off: "Comp-off", unavailable: "Unavailable",
};

export function exportRows(kind: ExportKind, input: ExportInput, days: RosterDay[]): Cell[][] {
  const view = createView(input, days);
  const podName = new Map(input.pods.map((p) => [p.id, p.name]));
  const people = [...input.employees].sort(
    (a, b) => (podName.get(a.podId) ?? "").localeCompare(podName.get(b.podId) ?? "") || a.name.localeCompare(b.name),
  );
  const pod = (id: number) => podName.get(id) ?? "";
  const statusOn = (employeeId: number, date: string) => {
    const day = view.day(employeeId, date);
    if (!day) return "";
    if (view.conflict(employeeId, date).length > 0) return "Cannot work";
    return day.duties.some((d) => d.isBackup) ? "Backup" : SHORT[day.status];
  };

  if (kind === "grid") {
    return [
      ["Employee", "Pod", ...view.dates],
      ...people.map((e) => [e.name, pod(e.podId), ...view.dates.map((date) => statusOn(e.id, date))]),
    ];
  }

  if (kind === "duties") {
    const brands = new Map(input.brands.map((b) => [b.id, b.name]));
    const processes = new Map(input.processes.map((p) => [p.id, p.code]));
    const services = new Map(input.services.map((s) => [s.id, s]));
    const rows: Cell[][] = [["Date", "Employee", "Pod", "Status", "Brand", "Process", "Role"]];
    for (const date of view.dates) {
      for (const e of people) {
        const day = view.day(e.id, date);
        if (!day) continue;
        const start = [date, e.name, pod(e.podId), statusOn(e.id, date)];
        if (day.duties.length === 0) rows.push([...start, "", "", ""]);
        for (const duty of day.duties) {
          const s = services.get(duty.serviceId);
          rows.push([...start, s ? (brands.get(s.brandId) ?? "") : "", s ? (processes.get(s.processId) ?? "") : "", duty.isBackup ? "Backup" : "Primary"]);
        }
      }
    }
    return rows;
  }

  const rows: Cell[][] = [["Date", "Work", "People needed", "People at work", "Result"]];
  for (const date of view.dates) {
    for (const s of input.services) {
      const { need, have } = view.coverage(s, date);
      if (need > 0) rows.push([date, view.serviceName(s.id), need, have, have >= need ? "Covered" : "SHORT"]);
    }
  }
  return rows;
}

// Spreadsheets run text starting with these as a formula. Names are typed by
// users, so such text gets a leading apostrophe and is shown as plain text.
const FORMULA = /^[=+\-@\t\r]/;

export function toCsv(rows: Cell[][]) {
  const cell = (value: Cell) => {
    const text = typeof value === "string" && FORMULA.test(value) ? `'${value}` : String(value);
    return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  // The leading mark tells Excel the file is UTF-8.
  return "﻿" + rows.map((row) => row.map(cell).join(",")).join("\r\n") + "\r\n";
}
