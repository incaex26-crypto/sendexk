# SenDexk

Same-day batched delivery marketplace for independent drivers in Johannesburg.
Businesses book, recipients confirm a map pin, drivers accept priced runs.
Needs **Node 24+**. No `npm install` — zero production dependencies (uses built-in `node:sqlite`).

## How to run

```
npm start           # http://localhost:3000  (admin key: dev-admin)
npm run seed        # fill data/app.db with a morning of test orders and drivers
npm run simulate    # print a full simulated day (70 orders, 12 drivers)
npm run new-region -- za-cpt "Cape Town" -33.92 18.42 Africa/Johannesburg ZAR ZA
```

## How to test

```
npm test            # unit + integration tests (must all pass before any commit)
npm run journey     # full end-to-end HTTP journey test
```

## Pages

`/` book · `/confirm.html?t=…` recipient confirms pin + gets delivery code ·
`/track.html?id=…` live tracking · `/driver.html` accept runs and scan deliveries ·
`/admin.html` overview, orders, drivers, ledger · `/business.html` wallet + API keys ·
`/store-pay.html` store checkout link

## Docs

- `docs/SPEC.md` — project brief, how a day works, full feature list and status
- `docs/DECISIONS.md` — settled choices, open questions, store rate check table
- `docs/PROGRESS.md` — current state, known gaps, next steps
- `docs/DESIGN.md` — design tokens, banned words, component patterns
- `CLAUDE.md` — rules for agents working on this repo
