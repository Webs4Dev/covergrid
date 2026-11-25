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

## Checks

`npm run lint`, `npm run typecheck`, `npm test`, `npm run build`
