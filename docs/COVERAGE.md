# COVERAGE.md — spec feature status
# Generated on 2026-10-29. Verified by code inspection and test presence.
# Status: built = test proves it; skeleton = code exists, no test or key piece missing; missing = not started.

| ID | P | Title | Status | Evidence |
|----|---|-------|--------|----------|
| A1 | 0 | Pickup/drop-off search, suburb list, dragged pins | skeleton | geocode.js + suburb chips in index.html; no address search wired to UI |
| A2 | 0 | Fixed price per vehicle from real costs, cap, profit check | built | src/pricing.js + test/pricing.test.js (9 tests) |
| A3 | 0 | Delivery windows: Now or booked | built | createOrder accepts `window`; test/journey.test.js section A |
| A4 | 0 | Same-address coalescing, stop time by distance | built | src/batching.js + test/flow.test.js coalescing tests |
| A5 | 1 | Parcel details: size, weight, fragile, prohibited | missing | createOrder has no fragile/prohibitedAccepted fields |
| A6 | 1 | Recurring deliveries, saved places, cancel/reschedule fees | missing | no recurring or saved-places model |
| A7 | 1 | EV range check 20% reserve, region config JSON, new-city script | built | pricing.js EVrange; config/regions/za-jhb.json; scripts/new-region.js |
| B1 | 0 | Payment provider interface (create link, webhook, duplicate-safe), fake adapter | missing | src/payments.js does not exist; POST /api/orders/:id/pay calls markPaid directly |
| B2 | 0 | Individuals pay fixed price at booking; no dispatch before payment | skeleton | markPaid + state machine; real payment link/webhook not wired |
| B3 | 0 | Business wallet: top-up, dispatch-from-wallet, statement, CSV, low-balance alerts | built | walletTopup/walletPayOrder/walletStatement in service.js; journey.test.js section B |
| B4 | 0 | Store checkout link: shopper-pays, wallet-mode, 30-min expiry, pin confirm | built | createQuoteLink/previewQuoteLink/redeemQuoteLink; journey.test.js section C |
| B5 | 0 | Double-entry ledger, atomic, idempotent | built | src/ledger.js + journey.test.js ledger-balance assertion |
| B6 | 1 | Driver payouts: weekly statement, bank payout, minimum, failed payout | skeleton | runPayouts() creates ledger entries; no bank API, no weekly statement endpoint |
| B7 | 1 | Refunds and cancellations through ledger; dispute/chargeback queue | missing | refund_due ledger account exists; no cancel-order API or refund endpoint |
| B8 | 1 | Invoices and VAT: tax invoices, earnings statements | missing | no invoice generation |
| B9 | 1 | Daily reconciliation report: provider vs ledger | missing | no reconciliation report |
| C1 | 0 | State machine with append-only events and idempotency keys | built | src/statemachine.js + events table + idemKey; test/flow.test.js |
| C2 | 0 | Batching nearby orders, atomic acceptance | built | src/batching.js + acceptRun with BEGIN IMMEDIATE; test/flow.test.js |
| C3 | 0 | Confirmation tokens (hashed, expiring), roll-unconfirmed job | built | src/confirm.js + sweepUnconfirmed; test/flow.test.js |
| C4 | 1 | Hotspots (demand heat map) with driver guidance | built | src/hotspots.js + refreshHotspots + bonusSpent; test/logic.test.js |
| C5 | 1 | ETA engine | built | src/eta.js; journey test verifies ETA is returned |
| C6 | 1 | Re-dispatch on driver dropout, timeouts, escalation | missing | no timeout/re-dispatch logic |
| C7 | 1 | Multi-region: drivers and orders inside their region | skeleton | loadRegions supports multiple regions; routing key matches region_id |
| D1 | 0 | Phone-code login, sessions, suspend, log out everywhere | built | src/auth.js requestOtp/verifyOtp/suspendDriver; test/auth.test.js |
| D2 | 0 | Trip pay/distance/stops before accepting; stop-by-stop; code entry + attempt limit | built | listOpenRuns; scan with code_attempts check at deliveryCodeMaxAttempts; driver.html |
| D3 | 1 | Driver onboarding: documents, vehicle, approval workflow, expiry reminders | missing | drivers table has name/phone/vehicle only; no documents or approval state |
| D4 | 1 | Proof of delivery: code + photo, recipient not home, return-to-sender | skeleton | code entry in scan; 'fail' + 'return' actions exist; no photo capture |
| D5 | 1 | Earnings screen, weekly statement | built | driverEarnings + driver.html earnings tab; journey.test.js section E |
| D6 | 1 | Safety: incident report, in-app support | missing | no incident report endpoint |
| E1 | 0 | Customer tracking: live map, delivery code, notifications | skeleton | GET /api/orders/:id/track exists; public/track.html missing |
| E2 | 0 | Business accounts: phone-code login, wallet, bookings, statements | skeleton | wallet API built; business.html uses x-account-id header, not real OTP |
| E3 | 0 | Store API: API keys (hashed, shown once, revocable), webhooks out | missing | POST /api/store/quote uses x-store-id header; no api_keys table or key endpoints |
| E4 | 1 | Store plugins: WooCommerce and Shopify checkout option, docs | missing | no plugin endpoints or docs |
| E5 | 1 | Notifications: WhatsApp, SMS, email, fallback, business WhatsApp, POPIA consent | built | src/notify.js + sandbox adapters; test/notify.test.js (8 tests) |
| E6 | 1 | Customer support: help centre, order issue, refund request | missing | no support endpoints |
| G1 | 0 | Named admin accounts, hashed passwords, expiring sessions, rate limits, audit log | built | src/auth.js admin_users + sessions; events log every action; test/auth.test.js |
| G2 | 0 | Live map, orders, drivers, businesses, ledger check, notification log, suspend | built | /api/admin/overview + admin.html; test/journey.test.js section F |
| G3 | 1 | Settings editor for pricing, platform share, caps (versioned, audit trail) | missing | config is read-only JSON; no editor or version history |
| G4 | 1 | Driver approvals, dispute queue, support inbox | missing | no approvals or dispute model |
| G5 | 1 | Reports: orders, revenue, driver earnings, CSV | missing | no report endpoints |
| G6 | 1 | Staff roles: admin, finance, support | missing | single admin role only |
| H1 | 0 | Sessions, hashed tokens/passwords, rate limits, no secrets in logs, hooks | built | src/auth.js + .claude/hooks; test/auth.test.js + test/hooks.test.js |
| H2 | 1 | HTTPS, security headers, CSRF, input validation, dependency scanning | skeleton | SameSite cookie; no CSRF tokens, no security headers middleware |
| H3 | 1 | Backups, monitoring, health check, structured logs | skeleton | GET /api/health exists; no backup or monitoring |
| H4 | 1 | POPIA: privacy notice, consent records, data export/delete | missing | no consent or privacy model |
| H5 | 1 | Terms, prohibited items, courier/transport rules, insurance (legal DECIDE) | missing | no terms pages or prohibited-items list |
| H6 | 1 | PWA, offline map caching, accessibility | missing | no manifest.json or service worker |
| H7 | 2 | Languages, currencies, public API docs, status page | missing | — |
| H8 | 1 | Name/brand checks: SenDexk domain, social handles (DECIDE) | missing | — |
| I1 | 0 | Seed data and demo accounts that never reach production | built | npm run seed; test helpers create isolated DBs |
| I2 | 1 | Pilot playbook (DECIDE) | missing | — |
| I3 | 1 | Ten-store delivery rate check | missing | — |
| I4 | 1 | Real provider accounts: payments, SMS, WhatsApp, maps | missing | all adapters are fake/sandbox |

## Summary (before this session)
- P0: 11 built, 4 skeleton (A1, B2, E1, E2), 2 missing (B1, E3)
- P1: 7 built (A7, C4, C5, D4-skeleton, D5, E5), 26 missing or skeleton
- P2+: all missing (not in scope)
