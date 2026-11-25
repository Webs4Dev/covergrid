import { describe, expect, it } from "vitest";
import { coverDay, type Candidate, type DayService } from "./cover-day";

type Setup = {
  services: DayService[];
  people: { id: number; max: number; can: Record<number, "primary" | "backup"> }[];
};

function solve({ services, people }: Setup) {
  const candidates = new Map<number, Candidate[]>();
  for (const s of services) {
    candidates.set(s.id, people.filter((p) => p.can[s.id]).map((p) => ({ employeeId: p.id, isBackup: p.can[s.id] === "backup" })));
  }
  return coverDay({ services, candidates, maxBrands: new Map(people.map((p) => [p.id, p.max])) });
}

const service = (id: number, brandId = id, need = 1, shiftId = 1): DayService => ({ id, brandId, shiftId, need });

// Tries every possible set of duties: the slow but certainly correct answer.
function bruteForce({ services, people }: Setup) {
  const slots = people.flatMap((p) =>
    services.filter((s) => p.can[s.id] && s.need > 0).map((s) => ({ p, s, backup: p.can[s.id] === "backup" })),
  );
  let best = { gaps: Infinity, backups: Infinity };
  for (let mask = 0; mask < 1 << slots.length; mask++) {
    const picked = slots.filter((_, i) => mask & (1 << i));
    const legal = people.every((p) => {
      const mine = picked.filter((x) => x.p === p).map((x) => x.s);
      return new Set(mine.map((s) => s.shiftId)).size <= 1 && new Set(mine.map((s) => s.brandId)).size <= p.max;
    });
    if (!legal) continue;
    const gaps = services.reduce((n, s) => n + Math.max(0, s.need - picked.filter((x) => x.s === s).length), 0);
    const backups = picked.filter((x) => x.backup).length;
    if (gaps < best.gaps || (gaps === best.gaps && backups < best.backups)) best = { gaps, backups };
  }
  return best;
}

describe("coverDay", () => {
  it("does not use a backup when the primary is at work", () => {
    const result = solve({
      services: [service(1), service(2, 1)],
      people: [
        { id: 1, max: 1, can: { 1: "primary", 2: "primary" } },
        { id: 2, max: 2, can: { 1: "backup", 2: "backup" } },
      ],
    });
    expect(result.gaps).toBe(0);
    expect(result.covers.every((c) => !c.isBackup)).toBe(true);
  });

  it("uses a backup when the primary is away, and reports what nobody can cover", () => {
    const result = solve({ services: [service(1), service(2)], people: [{ id: 2, max: 2, can: { 1: "backup" } }] });
    expect(result.covers).toEqual([{ employeeId: 2, serviceId: 1, isBackup: true }]);
    expect(result.gaps).toBe(1);
  });

  it("never gives one person two shifts or too many brands", () => {
    const twoShifts = solve({
      services: [service(1, 1, 1, 1), service(2, 2, 1, 2)],
      people: [{ id: 1, max: 5, can: { 1: "backup", 2: "backup" } }],
    });
    expect(twoShifts.gaps).toBe(1);
    const tooMany = solve({
      services: [service(1), service(2), service(3)],
      people: [{ id: 1, max: 2, can: { 1: "backup", 2: "backup", 3: "backup" } }],
    });
    expect(tooMany.gaps).toBe(1);
  });

  it("lets every primary at work do their service, even above the minimum", () => {
    const result = solve({
      services: [service(1)],
      people: [{ id: 1, max: 1, can: { 1: "primary" } }, { id: 2, max: 1, can: { 1: "primary" } }],
    });
    expect(result.covers).toHaveLength(2);
  });

  it("leaves closed services alone", () => {
    expect(solve({ services: [service(1, 1, 0)], people: [{ id: 1, max: 1, can: { 1: "primary" } }] }).covers).toEqual([]);
  });

  it("matches trying every possibility on 500 random days", () => {
    let seed = 7;
    const random = (n: number) => (seed = (seed * 1103515245 + 12345) % 2147483648) % n;
    for (let run = 0; run < 500; run++) {
      const services = [1, 2, 3, 4].map((id) => service(id, 1 + random(3), random(3), 1 + random(2)));
      const people = [1, 2, 3].map((id) => ({
        id,
        max: 1 + random(2),
        can: Object.fromEntries(
          services.filter(() => random(3) > 0).map((s) => [s.id, random(2) ? "primary" : "backup"] as const),
        ),
      }));
      const mine = solve({ services, people });
      const truth = bruteForce({ services, people });
      expect(mine.exact).toBe(true);
      expect({ run, gaps: mine.gaps }).toEqual({ run, gaps: truth.gaps });
      const backups = mine.covers.filter((c) => c.isBackup).length;
      expect({ run, backups }).toEqual({ run, backups: truth.backups });
    }
  });
});
