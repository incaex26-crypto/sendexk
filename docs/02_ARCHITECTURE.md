# Architecture

**One app, one database, one API** (a "modular monolith"). Thin pages on top. Simple on purpose: one person can run it.

```
 pages (public/)  ->  server.js (HTTP, routes)  ->  src/service.js (all actions, in transactions)
                                                      |- statemachine.js  legal status changes
                                                      |- pricing.js       cost, price, profit check
                                                      |- batching.js      parcels -> runs
                                                      |- ledger.js        double-entry money, cents
                                                      |- hotspots.js, eta.js, geo.js, confirm.js
                                                   db.js (SQLite file)   config/regions/*.json
```

## Key ideas
- **Events table** is append-only: every change writes who/what/when.
- **Idempotency key** on booking: a retry never creates a duplicate order.
- **Atomic accept:** one SQL update flips a run from open to accepted, so two drivers cannot both win.
- **Region config:** zones, vehicles, prices, cut-offs, rules, per city. New city = new JSON file (`npm run new-region`).
- **Swappable providers:** distance (haversine now, OSRM later), geocoding, payments, messaging, maps. Each sits behind one small function.

## Stand-ins to replace before real use
| Today | Replace with | Phase |
|---|---|---|
| Mock payment endpoint | Paystack or PayFast + signed webhook | 1 |
| ~~`x-driver-id` header login~~ | Phone OTP + sessions (done 2026-10-27, `src/auth.js`); codes still need SMS sending | 1 |
| Shared admin key | Real admin accounts | 1 |
| Links returned in API | SMS/WhatsApp sending | 1 |
| Schematic SVG map | MapLibre + PMTiles | 2 |
| Straight-line x 1.35 distance | OSRM road distance | 3 |
| SQLite file | Keep for pilot; Postgres if load needs it | later |
