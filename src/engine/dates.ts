// Date helpers on plain "YYYY-MM-DD" text. UTC is used only for arithmetic, so
// the server's time zone never matters.

const parse = (date: string) => new Date(`${date}T00:00:00Z`);
const format = (d: Date) => d.toISOString().slice(0, 10);

export function addDays(date: string, count: number) {
  const d = parse(date);
  d.setUTCDate(d.getUTCDate() + count);
  return format(d);
}

/** 0 = Sunday ... 6 = Saturday */
export const weekdayOf = (date: string) => parse(date).getUTCDay();

export function monthDates(month: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error(`Invalid month: ${month}`);
  const dates: string[] = [];
  for (let d = `${month}-01`; d.startsWith(month); d = addDays(d, 1)) dates.push(d);
  return dates;
}

/** The Monday-to-Sunday week that contains a date. */
export function weekOf(date: string) {
  const monday = addDays(date, -((weekdayOf(date) + 6) % 7));
  return [0, 1, 2, 3, 4, 5, 6].map((i) => addDays(monday, i));
}
