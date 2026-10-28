# SenDexk

Same-day batched delivery for independent drivers in dense areas. One app, one database, one API.
Needs **Node 22.5+**. No `npm install` (zero dependencies; uses built-in `node:sqlite`).

```
npm test            # tests: pricing, rules, full order flow, HTTP API, driver login
npm run simulate    # a seeded full day (70 orders, 12 drivers) printed as a report
npm run seed        # fill data/app.db with a morning of orders and drivers
npm run dev         # http://localhost:3000  (admin key: dev-admin; after seed, log in on the driver page with phone 0710000000; login codes show on screen)
npm run new-region -- za-cpt "Cape Town" -33.92 18.42 Africa/Johannesburg ZAR ZA
```

## Pages
`/` book a delivery · `/confirm.html?t=...` recipient confirms with a map pin · `/driver.html` accept runs, scan, deliver · `/admin.html` dispatch, hotspots, payouts, ledger.

## Where things live
| File | Job |
|---|---|
| `config/regions/*.json` | Everything that differs by city: zones, vehicles, prices, cut-offs, rules. A new city is one file. |
| `src/pricing.js` | Cost from the vehicle (fuel L/100km or kWh/100km), per-parcel split, quote cap, run profit check |
| `src/batching.js` | Confirmed parcels to runs: group, split by stops/weight, sequence, hold unprofitable runs |
| `src/statemachine.js` | The only list of legal order status changes |
| `src/service.js` | Every action (book, pay, confirm, dispatch, accept, scan, payouts). API and simulator both call it |
| `src/ledger.js` | Double-entry money in whole cents. Every transaction sums to zero |
| `src/hotspots.js`, `src/eta.js`, `src/geo.js` | Demand-minus-supply cells, ETA windows, distance maths |
| `src/sim.js` | The day simulator |
| `server.js` | Plain `node:http` server and routes |

## What is real and what is a stand-in
- **Real:** driver phone login (one-time code, hashed, 5-minute expiry, try and request limits; 30-day sessions), pricing, batching, state machine, confirmation tokens (hashed, expiring), delivery codes (attempt limit), idempotent booking, atomic run acceptance, ledger, payouts with holdback, hotspots, ETA, region config.
- **Stand-in, replace before launch:**
  - Payment: `POST /api/orders/:id/pay` is a mock. Replace with Paystack/PayFast checkout plus a signature-verified webhook that calls `markPaid`.
  - Login codes: shown on screen in test mode because no SMS provider is connected; on a live server (`NODE_ENV=production`) asking for a code is refused until one is.
  - SMS/WhatsApp: confirmation links are returned in the API response. Send them through a messaging provider.
  - Admin: one shared key in `ADMIN_KEY`. Use real accounts.
  - Maps: pages use a schematic SVG map. Swap in MapLibre + PMTiles; `geo.js` keeps haversine until you plug in OSRM behind `roadKm`.
  - Prices in `za-jhb.json` are illustrative. Measure real fuel, power and wage costs first.
  - Legal: driver status, liability caps, holding customer money and VAT need review before real money moves.

## For beginners and agents
Start with `docs/00_START_HERE.md`. Agents: read `CLAUDE.md`, then `docs/PROGRESS.md`.
