# CoverGrid

Smart roster management for an operations team that supports many D2C brands: plan,
generate, check and change monthly rosters across brands, processes and pods.

**Live app:** https://covergrid.vercel.app (December 2026 is the sample month)

There is no login. All data is fictional, anyone can edit it, and **Reset sample data** at
the bottom of the Dashboard restores it. Please do not enter real personal data.

## Approach

The hard part is not drawing a calendar, it is deciding who covers what and saying clearly
when that is impossible. So the scheduling logic is plain TypeScript with no database or
framework in it, and it has two independent halves:

- a **maker** that plans weekly offs and daily cover, and
- a **checker** that tests any roster (generated or edited by hand) against every rule.

The checker does not reuse the maker's decisions, so a mistake in the maker cannot hide
itself. The logic is deterministic: the same data gives the same roster, and every problem
comes with a reason a manager can read.

```
Browser
  |
Next.js (server-rendered pages and server actions, input checks)
  |                         |
src/engine                src/db  ->  PostgreSQL (Neon)
maker, checker, repair
(pure functions, tested)
```

**Stack:** Next.js 16, React 19, TypeScript, Tailwind CSS, PostgreSQL on Neon, Drizzle ORM,
Zod, Vitest, hosted on Vercel.

**Key decisions**

| Decision | Why | Trade-off |
|---|---|---|
| Own scheduling logic, not an AI model or a solver library | Repeatable, testable and explainable | Weekly-off choice is not proven optimal |
| Coverage is needed per brand + process | One brand's processes can differ in days, shift and staffing | More data to set up |
| Change = preview, then save | The manager sees the damage and the options first | One extra click |
| Gaps are shown, never papered over | Rest days and leave are never silently cancelled | The manager has to act |

## Sample data

32 employees in 4 pods and 20 brands. 16 brands (80%) have one person doing all their
processes; the other 4 have two or three, including processes shared by two people.
There are three operating calendars (365 days; public holidays off; Sundays and public
holidays off), three shifts, staffing rules, approved and pending time off, and one
requirement that is impossible on purpose (Trailhoof Customer Support needs 4 people on
25 December, but only 3 know the work).

## Using it

- **Dashboard:** the month at a glance, what is waiting for you, coverage by day and pod.
- **Setup** (side menu): employees, pods, brands, processes, assignments, calendars,
  shifts, staffing rules and holidays. No code changes are needed to add any of them.
- **Roster:** choose a month and generate it, then view it by company, pod, brand, process
  or employee. Select a date to see who is working, or a cell to edit that person's day.
- **Problems:** everything wrong with the roster and why, split into must-fix and
  preferences. A roster with must-fix problems can only be published with a written reason.
- **Time off:** **Review** a request to see its effect, new gaps and checked fixes before
  approving it. **Cancel** works the same way.
- **Repair:** when other data changes, the roster offers to update only the affected days.
- **Download CSV:** month grid, who does what, or coverage by day (opens in Excel and
  Google Sheets).

## How I think

### 1. How did you model employees, brands, processes, pods and their relationships?

- A **pod** has a lead. An **employee** belongs to one pod and has their own weekly-off
  count, fixed off days, days they cannot work, preferred off days and a limit on brands
  per day.
- A **brand** belongs to a pod and has a default **operating calendar**.
- A **brand process** (called a service in the code) is one process for one brand, for
  example "Glowleaf NDR". It is the unit that needs coverage. It has a shift, a minimum
  number of people and, optionally, its own calendar.
- An **assignment** links an employee to a brand process as **primary** or **backup**.
- **Staffing rules** override the minimum for a weekday or an exact date.
- **Time off** (leave, comp-off, unavailable) has a status; only approved entries count.
- A **roster** is one month. It has one row per person per date, plus the duties covered.

This keeps the brand's calendar (when work must happen) separate from the person's schedule
(when they work). The tables are in [src/db/schema.ts](src/db/schema.ts).

### 2. How does it generate a roster and decide whether it satisfies the constraints?

1. Work out the need of every brand process on every date. The most specific rule wins:
   a date rule, then the calendar, then a weekday rule, then the normal minimum.
2. Block days people cannot work (approved time off and unavailable weekdays).
3. Choose weekly offs. Each person starts with their own best days, then the choice is
   improved one change or one two-person swap at a time until nothing helps. An uncovered
   place costs far more than any preference, so client coverage comes first. Long working
   stretches and unfairly shared missed preferences also cost points.
4. For each day, an exact search decides who covers what, with the fewest gaps first and
   the fewest backups second. One person works one shift and a limited number of brands.

People who share no work cannot affect each other, so each connected group is planned
separately, which keeps it fast. Whole Monday-to-Sunday weeks are planned, and the previous
month's roster is counted for the shared week.

The **checker** then tests the result from scratch. **Must-fix:** gaps and under-staffing,
working while on leave or on a blocked day, shift clashes, too many brands, work without an
assignment, too few weekly offs, unearned comp-offs. **Preference:** missed preferred off
days, more than 7 days in a row, and similar notes.

### 3. How did you handle single-resource brands and brands with several employees?

Both use the same model, so there is no special case in the code. The difference is in the
assignments. A one-person brand has one primary, usually with the pod's floater and lead
as approved backups (Glowleaf NDR deliberately has none). A shared brand has several
primaries across its processes (sometimes two on the same one), often backing each other
up. The daily search uses primaries first and backups only when needed, and prefers one
backup for a whole brand.

### 4. What happens when someone who manages all of a brand's processes is unavailable?

Reviewing the leave request shows the effect before anything is saved:

- processes with an approved backup are covered, and the preview names the person;
- processes without one are flagged as a gap, with the reason;
- for each gap, the app lists checked options: an assigned person who is at work, a
  weekly-off swap inside the same week, or, only if no assigned person can help, adding a
  pod colleague as a new backup (labelled as needing training);
- if the request is still pending, nearby dates that would cause no new problem are
  suggested when there are any.

The manager can approve with a fix, approve and leave the gap flagged, or reject. In the
sample data, try Priya Nair's request for 14 December. Lakshmi Krishnan's request shows
the shared-brand case, where a colleague absorbs the work.

### 5. How does it handle conflicting requirements or insufficient staffing?

Mandatory rules are never traded away: approved leave, fixed offs, weekly-off counts,
shift limits and brand limits. Coverage ranks above preferences. If demand still cannot be
met, the gap stays visible with the reason for each assigned person, and "impossible with
the current team" when fewer people know the work than are needed. Publishing is then
blocked unless the manager writes why, and that reason is kept with the roster.

### 6. What is automated and what is left to people? Why?

**Automated:** building the month, choosing daily cover, finding problems, previewing the
effect of a change, suggesting fixes, repairing affected days, and crediting a comp-off for
publishing holiday work.

**Left to the manager:** approving or rejecting leave, choosing a fix, adding a new backup,
editing a day and publishing. These affect people and clients, and depend on things the
data does not know (is this person really trained, has the client agreed). A day edited by
hand is locked, so repair does not overwrite that decision unless the person cannot work.

### 7. If the company doubled its team and brand count, what would you change?

- Planning cost grows with the size of each connected group more than with the total, so I
  would measure large groups first. If they became slow or poor, I would move generation to
  a background job and use a constraint solver such as OR-Tools CP-SAT.
- Load only the time off and history a month needs, instead of whole tables.
- Add search and filters to the large grids and lists.
- Add logins and roles, so pod leads manage their own pods, and stop two people from
  overwriting each other's saves.

### 8. With one more week, what would you improve first?

1. Logins, roles and a pod-lead approval step.
2. Protection against two managers saving at once.
3. The plain edit form for time off, which can still approve without the preview.
4. Shifts that pass midnight.
5. Comp-offs based on attendance rather than the plan, and notifications when a published
   roster changes.

## Assumptions

- A week runs Monday to Sunday; weekly offs are counted per week.
- One shift per person per day, and a shift starts and ends on the same day.
- Minimum staffing counts people, not hours.
- A backup is someone already able to do the work.
- A public holiday applies to every calendar; each calendar decides whether it is open.
- Working a public holiday earns one comp-off, credited when the roster is published.

## Known limits

- The weekly-off choice is a local search, so it may miss a better arrangement.
- Repair never moves weekly offs (a suggested swap can, when you choose it).
- No locking if two managers save at the same time.
- No login, by design for this demo: anyone with the link can edit or reset it.

## Safety

- Every input is checked on the server, database queries are parameterised, and database
  error text is never shown.
- Each kind of data has a row limit so roster generation stays quick.
- `npm audit` reports a moderate issue inside `drizzle-kit` (a development tool, not part
  of the running app).

## Run it locally

Requires Node.js 22.12 or newer and a PostgreSQL database on [Neon](https://neon.com).

1. `npm install`
2. Copy `.env.example` to `.env.local` and set the variable below in the copy
3. `npm run db:migrate` creates the tables
4. `npm run db:reset` **deletes all data** and loads the fictional sample data
5. `npm run dev`, then open http://localhost:3000

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Neon PostgreSQL connection string |

## Checks

`npm run lint`, `npm run typecheck`, `npm test`, `npm run build`

`npm run roster:preview -- 2026-12` prints a roster made from the sample data and every
problem found in it, without needing a database.
