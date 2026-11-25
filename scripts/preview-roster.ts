// Prints a roster made from the sample data, without a database:
//   npm run roster:preview -- 2026-12
import { monthDates, weekdayOf } from "../src/engine/dates.ts";
import { createDemand } from "../src/engine/demand.ts";
import { generateRoster } from "../src/engine/generate.ts";
import * as data from "../src/seed/data.ts";
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

const demand = createDemand(input);
let required = 0;
const gaps: string[] = [];
for (const date of dates) {
  for (const s of input.services) {
    const need = demand(s, date);
    const have = days.filter((x) => x.date === date && x.duties.some((d) => d.serviceId === s.id)).length;
    required += need;
    if (have < need) {
      const name = `${data.brands[s.brandId - 1].name} ${data.processes[s.processId - 1].code}`;
      gaps.push(`${date}  ${name}: needs ${need}, has ${have}`);
    }
  }
}
console.log(`\n${required} places to cover, ${gaps.length} service-days short, exact: ${exact}, ${ms} ms`);
for (const gap of gaps) console.log(`  ${gap}`);
