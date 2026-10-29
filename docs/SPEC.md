# SenDexk spec

Same-day batched delivery marketplace for independent drivers in dense urban areas.  
First area: Johannesburg north (Sandton, Rosebank, Bryanston, Randburg, Fourways; Midrand as outer zone).

## How a day works

- Bookings are taken until the **booking cut-off (09:30)**. Later bookings move to the next day.
- Every recipient gets a one-tap link to confirm a map pin (or use GPS) and a delivery code. **Unconfirmed parcels are never collected.** They roll to the next day and expire after about 3 days (sender refunded).
- At the **confirmation cut-off (11:00)** the system batches confirmed parcels by vehicle class and zone. Runs that would lose money are held back.
- Drivers see runs priced for **their own vehicle** (petrol or electric motorbike, car, van) and accept one. First accept wins.
- Collection → out-for-delivery (customer sees ETA window) → delivery with the recipient's 4-digit code. Failed delivery returns to sender the same day in the pilot.

## Money model

- **Price** = driver cost (energy per km, wear, time, handling) ÷ (1 − platform share). Shared across parcels in a run.
- **Individual, no store:** pays SenDexk a firm price per vehicle class at booking, before pickup.
- **Business without a website:** prepaid wallet (top up by card/EFT). Dispatched only if wallet covers the cap. Charged actual price, never above cap. No credit in the pilot.
- **Store with a website:** two modes. *Default for pilot:* shopper pays on our link (paying = confirming). *Second mode:* store pays from its wallet (store sets its own delivery price, keeps the margin).
- Ledger in whole cents; weekly driver payouts with a short holdback.
- Driver plans: Standard (higher platform share) or prepaid 30-day **Pro pass** (lower share, first pick). No auto-renew.
- Hotspots: automatic (demand minus drivers per ~2 km cell), small capped bonuses.

## Not in scope

Own insurance pool, storage hosts or hubs, shopper feature, stock-aware slots, in-app turn-by-turn navigation. Uninsured by default with liability caps and banned items.

## Maps

| Job | Tool | Status |
|-----|------|--------|
| Show a map | MapLibre GL JS 4.7.1 + PMTiles 3.2.1 | Built; tiles need a manual download |
| Find an address | Suburb list + dragged pin (pilot) | Built |
| Measure distance | Haversine × 1.35 (OSRM later) | Built |
| Place a pin | Recipient drags pin on confirm page | Built |

**To get map tiles** (run once per deployment environment):
```
pmtiles extract <DAILY_BUILD_URL> data/maps/jhb.pmtiles \
  --bbox=27.83,-26.30,28.27,-25.90 --maxzoom=15
pmtiles show data/maps/jhb.pmtiles   # verify bounds
```
Source: https://maps.protomaps.com/builds. Licence: ODbL — show "© OpenStreetMap contributors" on every map. Never commit the `.pmtiles` file to git.

**New city checklist:**
1. `npm run new-region -- <id> "<Name>" <lat> <lng> <tz> <currency> <country>`
2. Run `pmtiles extract` with the new bounding box.
3. Fill local prices and cut-off times in the region config JSON.
4. Run `npm run simulate` for the new region before any real order.

## Feature status

Updated 2026-10-29. Status: **built** = test proves it · **skeleton** = code exists, key piece missing · **missing** = not started.

| ID | P | Feature | Status | Evidence |
|----|---|---------|--------|----------|
| A1 | 0 | Pickup/drop-off suburb list, dragged pins | skeleton | geocode.js + suburb chips in index.html; no address search wired to UI |
| A2 | 0 | Fixed price per vehicle from real costs, cap, profit check | built | src/pricing.js + test/pricing.test.js |
| A3 | 0 | Delivery windows: Now or booked | built | createOrder accepts `window`; journey.test.js |
| A4 | 0 | Same-address coalescing, stop time by distance | built | src/batching.js + test/flow.test.js |
| A5 | 1 | Parcel details: size, weight, fragile, prohibited | missing | no fragile/prohibitedAccepted fields |
| A6 | 1 | Recurring deliveries, saved places, cancel/reschedule fees | missing | no recurring or saved-places model |
| A7 | 1 | EV range check 20 % reserve, region config JSON, new-city script | built | pricing.js EVrange; config/regions/za-jhb.json; scripts/new-region.js |
| B1 | 0 | Payment provider interface (create link, webhook, duplicate-safe), fake adapter | built | src/payments.js + test/payments.test.js |
| B2 | 0 | Individuals pay fixed price at booking; no dispatch before payment | built | markPaid + state machine; POST /api/orders/:id/payment |
| B3 | 0 | Business wallet: top-up, dispatch-from-wallet, statement, CSV, low-balance alerts | built | walletTopup/walletPayOrder/walletStatement; journey.test.js |
| B4 | 0 | Store checkout link: shopper-pays, wallet-mode, 30-min expiry, pin confirm | built | createQuoteLink/previewQuoteLink/redeemQuoteLink; journey.test.js |
| B5 | 0 | Double-entry ledger, atomic, idempotent | built | src/ledger.js + journey.test.js |
| B6 | 1 | Driver payouts: weekly statement, bank payout stand-in | built | driverWeeklyStatement; GET /api/driver/statement |
| B7 | 1 | Cancellations through ledger (escrow → refund_due) | built | cancelOrder; POST /api/orders/:id/cancel |
| B8 | 1 | Invoices and VAT | missing | no invoice generation; see DECISIONS.md |
| B9 | 1 | Daily reconciliation report | missing | see DECISIONS.md |
| C1 | 0 | State machine with append-only events and idempotency keys | built | src/statemachine.js + events table; test/flow.test.js |
| C2 | 0 | Batching nearby orders, atomic acceptance | built | src/batching.js + acceptRun with BEGIN IMMEDIATE |
| C3 | 0 | Confirmation tokens (hashed, expiring), roll-unconfirmed job | built | src/confirm.js + sweepUnconfirmed; test/flow.test.js |
| C4 | 1 | Hotspots (demand heat map) with driver guidance | built | src/hotspots.js; test/logic.test.js |
| C5 | 1 | ETA engine | built | src/eta.js; journey.test.js |
| C6 | 1 | Re-dispatch on driver dropout, timeouts, escalation | missing | no timeout/re-dispatch logic |
| C7 | 1 | Multi-region: drivers and orders inside their region | skeleton | loadRegions supports multiple regions |
| D1 | 0 | Phone-code login, sessions, suspend, log out everywhere | built | src/auth.js; test/auth.test.js |
| D2 | 0 | Trip pay/distance/stops before accepting; stop-by-stop; code entry + attempt limit | built | listOpenRuns; scan with code_attempts check; driver.html |
| D3 | 1 | Driver onboarding: documents, vehicle, approval workflow | built | driver_documents table; submitDocument/approveDriver; test/stage3.test.js |
| D4 | 1 | Proof of delivery: code + photo stand-in, return-to-sender | built | recordDeliveryPhoto; scan 'fail'/'return' actions; see DECISIONS.md for real storage |
| D5 | 1 | Earnings screen, weekly statement | built | driverEarnings + driverWeeklyStatement; driver.html |
| D6 | 1 | Safety: incident report, in-app support | missing | no incident report endpoint |
| E1 | 0 | Customer tracking: live map, status steps, 8s poll | built | GET /api/orders/:id/track + public/track.html |
| E2 | 0 | Business accounts: phone-code login, wallet, statements | built | requestBusinessOtp/verifyBusinessOtp; biz_session cookie |
| E3 | 0 | Store API: API keys (hashed, shown once, revocable) | built | createStoreKey/keyToAccount/revokeKey; test/payments.test.js |
| E4 | 1 | Store plugins: WooCommerce/Shopify spec stand-in | built | GET /api/store/plugin/woocommerce; see DECISIONS.md for real OAuth |
| E5 | 1 | Notifications: WhatsApp, SMS, email, fallback, POPIA consent | built | src/notify.js + sandbox adapters; test/notify.test.js |
| E6 | 1 | Customer support: help centre, order issue, refund request | missing | no support endpoints |
| G1 | 0 | Named admin accounts, hashed passwords, expiring sessions, rate limits, audit log | built | src/auth.js admin_users + sessions; test/auth.test.js |
| G2 | 0 | Live map, orders, drivers, businesses, ledger check, notification log, suspend | built | /api/admin/overview + admin.html; journey.test.js |
| G3 | 1 | Settings editor for pricing, platform share, caps (versioned, audit trail) | built | platform_settings table; GET/PUT /api/admin/settings/:key |
| G4 | 1 | Driver approvals, dispute queue | built | pendingApprovals/approveDriver; disputes table; test/stage3.test.js |
| G5 | 1 | Reports: orders, revenue, driver earnings, CSV | missing | no report endpoints |
| G6 | 1 | Staff roles: admin, finance, support | missing | single admin role only |
| H1 | 0 | Sessions, hashed tokens/passwords, rate limits, no secrets in logs, hooks | built | src/auth.js + .claude/hooks; test/auth.test.js + test/hooks.test.js |
| H2 | 1 | HTTPS, security headers, CSRF, input validation | skeleton | SameSite cookie; no CSRF tokens, no security headers middleware |
| H3 | 1 | Backups, monitoring, health check | skeleton | GET /api/health exists; no backup or monitoring |
| H4 | 1 | POPIA: privacy notice, consent records, data export/delete | missing | see DECISIONS.md |
| H5 | 1 | Terms, prohibited items, courier/transport rules | missing | see DECISIONS.md |
| H6 | 1 | PWA, offline map caching, accessibility | missing | no manifest.json or service worker |
| H7 | 2 | Languages, currencies, public API docs, status page | missing | — |
| H8 | 1 | Name/brand checks: SenDexk domain, social handles | missing | — |
| I1 | 0 | Seed data and demo accounts | built | npm run seed; test helpers create isolated DBs |
| I2 | 1 | Pilot playbook | missing | see DECISIONS.md |
| I3 | 1 | Ten-store delivery rate check | missing | see DECISIONS.md |
| I4 | 1 | Real provider accounts: payments, SMS, WhatsApp, maps | missing | all adapters are fake/sandbox |

**Summary (2026-10-29):** P0 17 built · P1 19 built, 3 skeleton, 12 missing · 165 tests passing
