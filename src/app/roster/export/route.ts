import type { NextRequest } from "next/server";
import { loadInput, loadRoster } from "@/db/roster";
import { EXPORTS, exportRows, toCsv, type ExportKind } from "@/lib/export";
import { isMonth } from "@/lib/months";

export async function GET(request: NextRequest) {
  const month = request.nextUrl.searchParams.get("month") ?? "";
  const kind = request.nextUrl.searchParams.get("type") ?? "";
  if (!isMonth(month) || !Object.hasOwn(EXPORTS, kind)) return new Response("Not found", { status: 404 });

  const [input, roster] = await Promise.all([loadInput(month), loadRoster(month)]);
  if (!roster) return new Response("No roster for this month yet.", { status: 404 });

  const csv = toCsv(exportRows(kind as ExportKind, input, roster.days));
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="covergrid-${month}-${kind}-${roster.status}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
