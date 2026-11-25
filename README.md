# CoverGrid

Smart roster management: plan, generate, check and manage monthly rosters across
brands, processes and pods. Work in progress.

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

## Using it

The side menu holds every kind of data (people, brands, assignments, rules, time off).
Add, edit and delete from there; no code changes are needed.

On **Roster**, choose a month and generate it, then view it by company, pod, brand,
process or employee. Select a date to see who is working that day.

**Problems** lists everything wrong with the roster and why. A roster with must-fix
problems can only be published with a written reason. Publishing gives each person who
works a public holiday one comp-off; returning to draft removes those again.

**Changes after a roster exists:** select a cell to edit a day, or Review a request under
Time off. Both show the effect, new gaps and checked fixes before anything is saved. When
other data changes, the roster offers a repair that touches only the affected days. There is **no login**: this is
a demo with fictional data, so anyone can edit it, and **Reset sample data** on the Overview
page restores it. Do not enter real personal data.

## Checks

`npm run roster:preview -- 2026-12` prints a roster made from the sample data and every problem found in it.

`npm run lint`, `npm run typecheck`, `npm test`, `npm run build`
