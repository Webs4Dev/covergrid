// Decides who covers which service on ONE day, given who is at work.
//
// Hard limits: a person works one shift a day and at most maxBrandsPerDay brands,
// and only covers services they are assigned to (primary or backup).
// Goal, in order: fewest uncovered places, then fewest backups, then simple and
// fair choices. It is an exact search, with a step limit for extreme inputs.

export const GAP_COST = 10_000;
export const BACKUP_COST = 10;
const STEP_LIMIT = 200_000;

export type DayService = { id: number; brandId: number; shiftId: number; need: number };
export type Candidate = { employeeId: number; isBackup: boolean };
export type DayProblem = {
  services: DayService[]; // all services, including those with need 0
  candidates: Map<number, Candidate[]>; // service id -> people at work who can do it
  maxBrands: Map<number, number>;
  extraCost?: (employeeId: number) => number; // small cost of using a person as backup
};
export type Cover = { employeeId: number; serviceId: number; isBackup: boolean };
export type DayResult = { cost: number; gaps: number; covers: Cover[]; exact: boolean };

export function coverDay(problem: DayProblem): DayResult {
  const { candidates, maxBrands } = problem;
  const extra = problem.extraCost ?? (() => 0);
  const of = (s: DayService) => candidates.get(s.id) ?? [];
  const backupsNeeded = (s: DayService) =>
    Math.max(0, Math.min(s.need, of(s).length) - of(s).filter((c) => !c.isBackup).length);
  // The least this service can possibly cost, used to abandon bad branches early.
  const least = (s: DayService) => Math.max(0, s.need - of(s).length) * GAP_COST + backupsNeeded(s) * BACKUP_COST;

  // Hardest service first: the one with the fewest spare people.
  const open = problem.services
    .filter((s) => s.need > 0)
    .sort((a, b) => of(a).length - a.need - (of(b).length - b.need) || a.id - b.id);
  const leastFrom: number[] = new Array(open.length + 1).fill(0);
  for (let i = open.length - 1; i >= 0; i--) leastFrom[i] = leastFrom[i + 1] + least(open[i]);

  const shiftOf = new Map<number, number>();
  const brandsOf = new Map<number, Map<number, number>>();
  const chosen: Cover[] = [];
  let best: { cost: number; covers: Cover[] } | null = null;
  let steps = 0;

  const fits = (person: number, s: DayService) => {
    const shift = shiftOf.get(person);
    if (shift !== undefined && shift !== s.shiftId) return false;
    const brands = brandsOf.get(person);
    return !brands || brands.has(s.brandId) || brands.size < (maxBrands.get(person) ?? 1);
  };
  const costOf = (c: Candidate, s: DayService) => {
    if (!c.isBackup) return 0;
    // Prefer one backup for a whole brand, and people with less on their plate.
    const brands = brandsOf.get(c.employeeId);
    const spread = brands?.has(s.brandId) ? 0 : 1 + (brands?.size ?? 0);
    return BACKUP_COST + spread + extra(c.employeeId);
  };
  const add = (c: Candidate, s: DayService) => {
    const before = shiftOf.get(c.employeeId);
    shiftOf.set(c.employeeId, s.shiftId);
    const brands = brandsOf.get(c.employeeId) ?? new Map<number, number>();
    brands.set(s.brandId, (brands.get(s.brandId) ?? 0) + 1);
    brandsOf.set(c.employeeId, brands);
    chosen.push({ employeeId: c.employeeId, serviceId: s.id, isBackup: c.isBackup });
    return () => {
      chosen.pop();
      if (before === undefined) shiftOf.delete(c.employeeId);
      const left = (brands.get(s.brandId) ?? 1) - 1;
      if (left === 0) brands.delete(s.brandId);
      else brands.set(s.brandId, left);
    };
  };

  // Choose people for service i, starting from candidate k, with `left` places to fill.
  function search(i: number, k: number, left: number, cost: number): void {
    if (best && steps++ > STEP_LIMIT) return;
    if (i === open.length) {
      if (!best || cost < best.cost) best = { cost, covers: [...chosen] };
      return;
    }
    const s = open[i];
    const people = order.get(s.id)!;
    const noOneLeft = Math.max(0, left - (people.length - k)) * GAP_COST;
    if (best && cost + noOneLeft + leastFrom[i + 1] >= best.cost) return;
    const next = (): void => search(i + 1, 0, open[i + 1]?.need ?? 0, cost + left * GAP_COST);
    if (left === 0) return next();
    for (let j = k; j < people.length; j++) {
      const c = people[j];
      if (!fits(c.employeeId, s)) continue;
      const price = costOf(c, s);
      const undo = add(c, s);
      search(i, j + 1, left - 1, cost + price);
      undo();
    }
    next(); // leave the remaining places empty
  }

  const order = new Map(
    open.map((s) => [
      s.id,
      [...of(s)].sort(
        (a, b) =>
          Number(a.isBackup) - Number(b.isBackup) ||
          extra(a.employeeId) - extra(b.employeeId) ||
          a.employeeId - b.employeeId,
      ),
    ]),
  );
  search(0, 0, open[0]?.need ?? 0, 0);

  const result = best as { cost: number; covers: Cover[] } | null;
  const covers = result?.covers ?? [];
  const gaps = open.reduce((n, s) => n + s.need, 0) - covers.length;

  // Primaries who are at work also do their own open services beyond the minimum.
  for (const cover of covers) add({ employeeId: cover.employeeId, isBackup: cover.isBackup }, open.find((s) => s.id === cover.serviceId)!);
  const all = [...covers];
  for (const s of open) {
    for (const c of of(s)) {
      const already = all.some((x) => x.serviceId === s.id && x.employeeId === c.employeeId);
      if (c.isBackup || already || !fits(c.employeeId, s)) continue;
      add(c, s);
      all.push({ employeeId: c.employeeId, serviceId: s.id, isBackup: false });
    }
  }
  return { cost: result?.cost ?? 0, gaps, covers: all, exact: steps <= STEP_LIMIT };
}
