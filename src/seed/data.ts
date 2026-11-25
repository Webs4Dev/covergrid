// Fictional sample data. Plain values only, so it can be tested without a database.

const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];
const NOT_SUNDAY = [1, 2, 3, 4, 5, 6];
export const SUN = 0, MON = 1, TUE = 2, WED = 3, FRI = 5, SAT = 6;

export const calendars = [
  { id: 1, name: "365 days", openDays: EVERY_DAY, openOnHolidays: true },
  { id: 2, name: "Public holidays off", openDays: EVERY_DAY, openOnHolidays: false },
  { id: 3, name: "Sundays and public holidays off", openDays: NOT_SUNDAY, openOnHolidays: false },
];
const CAL = { all: 1, phOff: 2, sunOff: 3 } as const;

export const shifts = [
  { id: 1, name: "Day", startTime: "10:00", endTime: "19:00" },
  { id: 2, name: "Morning", startTime: "07:00", endTime: "16:00" },
  { id: 3, name: "Evening", startTime: "13:00", endTime: "22:00" },
];
const SHIFT = { day: 1, morning: 2, evening: 3 } as const;

export const processes = [
  { id: 1, code: "CS", name: "Customer Support" },
  { id: 2, code: "ACC", name: "Abandoned Cart Conversions" },
  { id: 3, code: "NDR", name: "Non-Delivery Reports" },
  { id: 4, code: "RET", name: "Retention" },
];
type Code = "CS" | "ACC" | "NDR" | "RET";

export const holidays = [
  { date: "2026-12-25", name: "Christmas" },
  { date: "2027-01-01", name: "New Year's Day" },
  { date: "2027-01-26", name: "Republic Day" },
  { date: "2027-05-01", name: "May Day" },
  { date: "2027-08-15", name: "Independence Day" },
  { date: "2027-10-02", name: "Gandhi Jayanti" },
  { date: "2027-12-25", name: "Christmas" },
];

type Person = {
  name: string;
  preferredOffDays?: number[];
  fixedOffDays?: number[];
  unavailableDays?: number[];
  weeklyOffCount?: number;
  maxBrandsPerDay?: number;
};
type Pod = { name: string; lead: string; floater: string; team: Person[] };

// Leads and floaters are approved backups for single-person brands in their pod.
const podList: Pod[] = [
  {
    name: "Aurora", lead: "Meera Joshi", floater: "Kabir Anand",
    team: [
      { name: "Priya Nair", preferredOffDays: [SUN] },
      { name: "Arjun Rao", preferredOffDays: [SUN] },
      { name: "Sana Sheikh", preferredOffDays: [SUN] },
      { name: "Dev Malhotra", preferredOffDays: [MON] },
      { name: "Isha Kulkarni", preferredOffDays: [TUE] },
      { name: "Rohit Bansal", preferredOffDays: [SUN] },
    ],
  },
  {
    name: "Banyan", lead: "Vikram Sethi", floater: "Nisha Pillai",
    team: [
      { name: "Aditya Menon", preferredOffDays: [SUN] },
      { name: "Farah Khan", preferredOffDays: [FRI] },
      { name: "Karan Gill", preferredOffDays: [SAT] },
      { name: "Ananya Das", preferredOffDays: [SUN] },
      { name: "Harsh Vora", preferredOffDays: [SUN] },
      { name: "Pooja Iyer", preferredOffDays: [WED] },
    ],
  },
  {
    name: "Cedar", lead: "Tara Bose", floater: "Imran Qureshi",
    team: [
      { name: "Neha Patil", preferredOffDays: [SAT, SUN] },
      { name: "Yash Thakur", unavailableDays: [WED] },
      { name: "Ritu Saxena", fixedOffDays: [SUN] },
      { name: "Manav Shah", preferredOffDays: [SUN] },
      { name: "Kavya Reddy", preferredOffDays: [SUN] },
      { name: "Omkar Jadhav", preferredOffDays: [SUN] },
    ],
  },
  {
    name: "Delta", lead: "Rahul Dutta", floater: "Simran Kaur",
    team: [
      { name: "Aisha Fernandes", preferredOffDays: [SUN] },
      { name: "Nikhil Deshmukh" },
      { name: "Zoya Mirza", fixedOffDays: [SUN] },
      { name: "Varun Chawla", preferredOffDays: [MON] },
      { name: "Lakshmi Krishnan", preferredOffDays: [SUN] },
      { name: "Gaurav Mishra", preferredOffDays: [SUN] },
    ],
  },
];

const people = podList.flatMap((pod, i) =>
  [{ name: pod.lead, maxBrandsPerDay: 3 }, { name: pod.floater, maxBrandsPerDay: 4 }, ...pod.team]
    .map((person: Person) => ({ ...person, podId: i + 1 })),
);

export const employees = people.map((p, i) => ({
  id: i + 1,
  name: p.name,
  podId: p.podId,
  weeklyOffCount: p.weeklyOffCount ?? 1,
  fixedOffDays: p.fixedOffDays ?? [],
  unavailableDays: p.unavailableDays ?? [],
  preferredOffDays: p.preferredOffDays ?? [],
  maxBrandsPerDay: p.maxBrandsPerDay ?? 2,
}));

function employeeId(name: string) {
  const found = employees.find((e) => e.name === name);
  if (!found) throw new Error(`Unknown employee in sample data: ${name}`);
  return found.id;
}

export const pods = podList.map((p, i) => ({ id: i + 1, name: p.name, leadId: employeeId(p.lead) }));

type Service = {
  process: Code;
  primary: string[];
  backup?: string[]; // replaces the pod's default backups
  calendar?: number; // replaces the brand's calendar
  minStaff?: number;
};
type Brand = { name: string; pod: number; calendar: number; shift?: number; services: Service[] };

const solo = (name: string, codes: Code[]): Service[] =>
  codes.map((process) => ({ process, primary: [name] }));

const brandList: Brand[] = [
  // Aurora
  {
    name: "Glowleaf", pod: 1, calendar: CAL.all,
    services: [
      { process: "CS", primary: ["Priya Nair"] },
      // No backup on purpose: leave on an open day leaves a gap the manager must solve.
      { process: "NDR", primary: ["Priya Nair"], backup: [], calendar: CAL.sunOff },
    ],
  },
  { name: "Pawprint Pantry", pod: 1, calendar: CAL.all, services: solo("Arjun Rao", ["CS", "ACC"]) },
  { name: "Brewmint", pod: 1, calendar: CAL.phOff, services: solo("Sana Sheikh", ["CS"]) },
  { name: "Little Acorns", pod: 1, calendar: CAL.sunOff, services: solo("Sana Sheikh", ["CS", "RET"]) },
  {
    name: "Trailhoof", pod: 1, calendar: CAL.all,
    services: [
      { process: "CS", primary: ["Dev Malhotra", "Isha Kulkarni"], backup: ["Kabir Anand"] },
      { process: "ACC", primary: ["Isha Kulkarni"], backup: ["Dev Malhotra"] },
      { process: "NDR", primary: ["Rohit Bansal"], backup: ["Dev Malhotra"], calendar: CAL.sunOff },
    ],
  },
  // Banyan
  { name: "Stridewell", pod: 2, calendar: CAL.sunOff, services: solo("Aditya Menon", ["CS", "NDR"]) },
  { name: "Cocoknot", pod: 2, calendar: CAL.phOff, services: solo("Aditya Menon", ["CS"]) },
  { name: "Moonthread", pod: 2, calendar: CAL.all, services: solo("Farah Khan", ["CS", "ACC", "NDR"]) },
  { name: "Zestbowl", pod: 2, calendar: CAL.all, shift: SHIFT.evening, services: solo("Karan Gill", ["CS"]) },
  {
    name: "Lumora Home", pod: 2, calendar: CAL.sunOff,
    services: [
      { process: "CS", primary: ["Ananya Das", "Harsh Vora"], backup: ["Nisha Pillai"], minStaff: 2 },
      { process: "ACC", primary: ["Pooja Iyer"], backup: ["Vikram Sethi"], calendar: CAL.phOff },
      { process: "RET", primary: ["Pooja Iyer"], backup: ["Harsh Vora"] },
    ],
  },
  // Cedar
  { name: "Velvetroot", pod: 3, calendar: CAL.all, services: solo("Neha Patil", ["CS", "RET"]) },
  { name: "Sprocketly", pod: 3, calendar: CAL.phOff, services: solo("Yash Thakur", ["CS", "NDR"]) },
  { name: "Herbanest", pod: 3, calendar: CAL.sunOff, services: solo("Ritu Saxena", ["CS", "ACC"]) },
  { name: "Cloudcrib", pod: 3, calendar: CAL.all, services: solo("Manav Shah", ["CS"]) },
  {
    name: "Fitforge", pod: 3, calendar: CAL.all,
    services: [
      { process: "CS", primary: ["Kavya Reddy"], backup: ["Omkar Jadhav", "Imran Qureshi"] },
      { process: "ACC", primary: ["Omkar Jadhav"], backup: ["Kavya Reddy"], calendar: CAL.sunOff },
      { process: "NDR", primary: ["Omkar Jadhav"], backup: ["Kavya Reddy"], calendar: CAL.sunOff },
    ],
  },
  // Delta
  { name: "Inkwillow", pod: 4, calendar: CAL.all, services: solo("Aisha Fernandes", ["CS", "NDR"]) },
  { name: "Petalpost", pod: 4, calendar: CAL.phOff, shift: SHIFT.morning, services: solo("Nikhil Deshmukh", ["CS"]) },
  { name: "Grainghar", pod: 4, calendar: CAL.sunOff, services: solo("Zoya Mirza", ["CS", "ACC"]) },
  { name: "Tidewear", pod: 4, calendar: CAL.all, services: solo("Varun Chawla", ["CS", "RET"]) },
  {
    name: "Nestora", pod: 4, calendar: CAL.all,
    services: [
      { process: "CS", primary: ["Lakshmi Krishnan", "Gaurav Mishra"], backup: ["Simran Kaur"] },
      { process: "RET", primary: ["Lakshmi Krishnan"], backup: ["Gaurav Mishra"] },
      { process: "NDR", primary: ["Gaurav Mishra"], backup: ["Lakshmi Krishnan"], calendar: CAL.sunOff },
    ],
  },
];

export const brands = brandList.map((b, i) => ({
  id: i + 1, name: b.name, podId: b.pod, calendarId: b.calendar,
}));

const serviceList = brandList.flatMap((brand, i) =>
  brand.services.map((service) => ({ ...service, brand, brandId: i + 1 })),
);

export const services = serviceList.map((s, i) => ({
  id: i + 1,
  brandId: s.brandId,
  processId: processes.findIndex((p) => p.code === s.process) + 1,
  calendarId: s.calendar ?? null,
  shiftId: s.brand.shift ?? SHIFT.day,
  minStaff: s.minStaff ?? 1,
}));

export const assignments = serviceList.flatMap((s, i) => {
  const pod = podList[s.brand.pod - 1];
  const backups = s.backup ?? [pod.floater, pod.lead];
  return [
    ...s.primary.map((name) => ({ employeeId: employeeId(name), serviceId: i + 1, role: "primary" as const })),
    ...backups.map((name) => ({ employeeId: employeeId(name), serviceId: i + 1, role: "backup" as const })),
  ];
});

function serviceId(brand: string, code: Code) {
  const index = serviceList.findIndex((s) => s.brand.name === brand && s.process === code);
  if (index < 0) throw new Error(`Unknown service in sample data: ${brand} ${code}`);
  return index + 1;
}

export const staffingRules = [
  { serviceId: serviceId("Trailhoof", "CS"), weekday: SAT, date: null, minStaff: 2, note: "Weekend rush" },
  { serviceId: serviceId("Nestora", "CS"), weekday: FRI, date: null, minStaff: 2, note: "Weekly sale" },
  { serviceId: serviceId("Brewmint", "CS"), weekday: null, date: "2026-12-25", minStaff: 1, note: "Open for the Christmas sale" },
  { serviceId: serviceId("Grainghar", "ACC"), weekday: null, date: "2026-12-31", minStaff: 0, note: "Closed for stock count" },
  // Impossible on purpose: only 3 people know this work, so the app must report it.
  { serviceId: serviceId("Trailhoof", "CS"), weekday: null, date: "2026-12-25", minStaff: 4, note: "Christmas campaign" },
];

const off = (
  name: string,
  kind: "leave" | "comp_off" | "unavailable",
  status: "requested" | "approved" | "rejected",
  startDate: string,
  endDate: string,
  reason: string,
) => ({ employeeId: employeeId(name), kind, status, startDate, endDate, reason });

export const timeOff = [
  off("Manav Shah", "leave", "approved", "2026-12-08", "2026-12-10", "Family wedding"),
  off("Farah Khan", "leave", "approved", "2026-12-17", "2026-12-18", "Travel"),
  off("Omkar Jadhav", "leave", "approved", "2026-12-21", "2026-12-21", "Personal"),
  off("Rohit Bansal", "comp_off", "approved", "2026-12-16", "2026-12-16", "Worked on Diwali"),
  off("Varun Chawla", "comp_off", "approved", "2026-12-22", "2026-12-22", "Worked on Diwali"),
  off("Harsh Vora", "unavailable", "approved", "2026-12-11", "2026-12-11", "Training day"),
  // The main demo: approving this leaves Glowleaf NDR with nobody.
  off("Priya Nair", "leave", "requested", "2026-12-14", "2026-12-14", "Doctor's appointment"),
  off("Lakshmi Krishnan", "leave", "requested", "2026-12-23", "2026-12-24", "Family visit"),
  off("Neha Patil", "leave", "rejected", "2026-12-31", "2026-12-31", "New Year's Eve"),
];

export const compOffCredits = [
  "Rohit Bansal", "Varun Chawla", "Arjun Rao",
].map((name) => ({ employeeId: employeeId(name), earnedOn: "2026-11-08", reason: "Worked on Diwali" }));
