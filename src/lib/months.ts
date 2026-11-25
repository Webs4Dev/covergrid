export const isMonth = (value: string) => /^20\d\d-(0[1-9]|1[0-2])$/.test(value);

const label = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
export const monthLabel = (month: string) => label.format(new Date(`${month}-01T00:00:00Z`));

/** This month and the following twelve. */
export function monthChoices(today = new Date()) {
  return Array.from({ length: 13 }, (_, i) =>
    new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + i, 1)).toISOString().slice(0, 7),
  );
}

export const nextMonth = (today = new Date()) => monthChoices(today)[1];
