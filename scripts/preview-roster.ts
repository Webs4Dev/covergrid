// Prints a roster made from the sample data, without a database:
//   npm run roster:preview -- 2026-12
import { checkRoster } from "../src/engine/check.ts";
import { monthDates, weekdayOf } from "../src/engine/dates.ts";
import { generateRoster } from "../src/engine/generate.ts";
import { sampleInput } from "../src/seed/roster-input.ts";

const input = sampleInput(process.argv[2] ?? "2026-12");
const started = performance.now();
const { days, exact } = generateRoster(input);
const ms = Math.round(performance.now() - started);
const dates = monthDates(input.month);
const symbol = { working: ".", weekly_off: "O", holiday: "H", leave: "L", comp_off: "C", unavailable: "U" };

console.log(`${input.month}  . working  + covering as backup  O weekly off  H holiday  L leave  C comp-off  U unavailable\n`);
console.log(" ".repeat(20) + dates.map((d) => "SMTWTFS"[weekdayOf(d)]).join(" "));
for (const e of input.employees) {
  const row = dates.map((date) => {
    const day = days.find((x) => x.employeeId === e.id && x.date === date)!;
    return day.duties.some((x) => x.isBackup) ? "+" : symbol[day.status];
  });
  console.log(e.name.padEnd(20) + row.join(" "));
}

const issues = checkRoster(input, days);
const mustFix = issues.filter((i) => i.severity === "must_fix");
console.log(`\nMade in ${ms} ms, exact: ${exact}. ${mustFix.length} must fix, ${issues.length - mustFix.length} preferences.`);
for (const i of issues) {
  console.log(`\n[${i.severity === "must_fix" ? "MUST FIX" : "preference"}] ${i.date ?? "month"}  ${i.message}`);
  for (const reason of i.reasons) console.log(`    - ${reason}`);
}
