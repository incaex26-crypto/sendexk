# SenDexk platform spec (single source of truth)

Priority: P0 = needed before any real pilot. P1 = needed for public launch. P2 = growth and extra revenue. P3 = later.
Status is verified by the agent in docs/COVERAGE.md (built / skeleton / missing). DECIDE = needs the owner (see docs/BLOCKED.md); build with a stand-in and log it.
Principles: web-first, one connected system, zero dependencies where possible, money in whole cents, all figures from the ledger, firm prices, pay drivers for real work, earn through volume, global-capable (region config), plain wording on screens (docs/DESIGN.md).

## A. Booking and pricing
A1 P0 Pickup and drop-off by search, suburb list, or dragged map pins. Address search sits behind one geocoder function (DECIDE provider).
A2 P0 One fixed price per vehicle class (bike, car, van, EV variants) before paying. Price comes from the accepting vehicle's real cost (fuel L/100km or EV kWh/100km, wear, time, handling), trip price = cost / (1 - platform share). Parcel price falls as trip size grows. Cap and fixed price. Profit check.
A3 P0 Delivery windows: Now, or a booked window. P2: slots product (see F).
A4 P0 Same-address pickups are one stop. Stop time by distance: 30 m same stop, 30 to 150 m walking time, over 150 m separate stop. Driver is paid for the real route and sees the total before accepting.
A5 P1 Parcel details: size, weight, fragile, notes, prohibited-items list and acceptance, optional declared value.
A6 P1 Recurring deliveries and saved places for businesses. Cancel and reschedule rules with fees by stage.
A7 P1 EV range check with 20% reserve. Region config JSON for currency, units, fuel prices, wear, platform share, cap (maxParcelPrice R100 start). New-city script.

## B. Payments and money
B1 P0 Payment provider interface (create link, status, webhook with signature, duplicate-safe), fake sandbox adapter, real adapter later (DECIDE provider).
B2 P0 Individuals pay the fixed price at booking. Dispatch only after payment confirms.
B3 P0 Businesses: prepaid wallet. Dispatch only if wallet covers the cap. Charged actual price up to cap. Top-up, statement, CSV, low-balance alerts.
B4 P0 Stores with websites: checkout link. Pilot default: shopper pays on our link, paying confirms, falls back to the store's own carrier after about 30 minutes. Second mode: store pays from wallet. Price from typed address at checkout, pin confirmed after. Quote tokens hashed, expiring, one use.
B5 P0 Double-entry ledger, atomic, idempotent. Hold funds until delivery is confirmed, then release to driver and platform.
B6 P1 Driver payouts: weekly statement, bank payout via provider (DECIDE), minimum payout, failed payout handling.
B7 P1 Refunds and cancellations through the ledger. Disputes and chargebacks queue.
B8 P1 Invoices and VAT: tax invoices to businesses, driver earnings statements, monthly statements.
B9 P1 Daily reconciliation report: provider vs ledger, with alerts on mismatch.

## C. Trips and dispatch
C1 P0 Order state machine with append-only events and idempotency keys.
C2 P0 Batching nearby orders into trips, atomic acceptance by one driver.
C3 P0 Confirmation tokens (hashed, expiring) and the "roll unconfirmed" job for stores that need shopper confirmation.
C4 P1 Hotspots (demand heat map) with driver guidance. Hotspot funding is a DECIDE.
C5 P1 ETA engine. Later OSRM routing for real road distances and times (P2).
C6 P1 Re-dispatch when a driver drops out or is late. Timeouts, escalation to admin.
C7 P1 Multi-region: drivers and orders only match inside their region.

## D. Drivers
D1 P0 Phone-code login, sessions, suspend and log out everywhere.
D2 P0 See trip pay, distance and stops before accepting. Stop-by-stop screens. Delivery code entry with attempt limit.
D3 P1 Onboarding: documents (ID, licence, vehicle papers), vehicle class and fuel type or EV, approval workflow by admin, document expiry reminders.
D4 P1 Proof of delivery: code, optional photo, recipient not home flow, return-to-sender rules.
D5 P1 Earnings screen, weekly statement, tips (P2), ratings and quality score both ways.
D6 P1 Safety: report an incident, in-app support, share live trip with a contact (P2).
D7 P2 Driver tiers and the Pro plan (price DECIDE). EV incentive (DECIDE).

## E. Customers, businesses and stores
E1 P0 Customer booking and tracking with live map, delivery code, notifications.
E2 P0 Business accounts: phone-code login, wallet, bookings, statements, team members with roles (P1).
E3 P0 Store API: API keys (hashed, shown once, revocable), create quote, webhooks out for order events.
E4 P1 Store plugins: WooCommerce and Shopify checkout option that uses our checkout link. Docs and a test store.
E5 P1 Notifications: one layer, channels WhatsApp, SMS, email, fallback order per user. Each business connects its own WhatsApp number (Meta embedded signup, DECIDE and start approval early). Drivers get SMS or email. Service messages always send, marketing needs consent (POPIA).
E6 P1 Customer support: help centre, contact, order issue reporting, refunds request.
E7 P2 Ratings and tips from customers.

## F. Growth and extra revenue (proposed, mostly DECIDE)
F1 P2 Slots product: businesses book recurring pickup slots on a departures-board style screen, pay in advance, get priority.
F2 P2 Confirmed arrival windows and flexible-price options.
F3 P2 Pro subscription for businesses or drivers.
F4 P2 Sponsored or featured placements, store commission on checkout-link orders, hotspot top-ups.
F5 P2 Referral credits. Promo codes. Loyalty for repeat businesses.
F6 P2 The killer feature: to be chosen by the owner from F1, F2 and live shared trips. Do not invent one.

## G. Admin and operations
G1 P0 Named admin accounts, hashed passwords, expiring sessions, rate limits, audit log of every admin action.
G2 P0 Live map of trips and drivers, orders, drivers, businesses, ledger check, notification log, suspend a driver.
G3 P1 Settings editor for pricing, platform share, caps, regions (versioned, with an audit trail).
G4 P1 Driver approvals queue, dispute and refund queue, support inbox.
G5 P1 Reports: orders, revenue, driver earnings, wallet balances, delivery times, cancellations. CSV export.
G6 P1 Roles for staff: admin, finance, support, with limits.

## H. Platform, security, legal
H1 P0 Sessions, hashed tokens and passwords, rate limits, no secrets in logs, hooks that block secret leaks. Upgrade tests for database changes.
H2 P1 HTTPS and secure cookie flags, security headers, CSRF protection, input validation, dependency and secret scanning.
H3 P1 Backups and restore test, monitoring, error alerts, health check, structured logs.
H4 P1 POPIA: privacy notice, consent records, data export and delete, retention rules, operator agreements.
H5 P1 Terms for customers, businesses, drivers. Prohibited items. Courier and transport rules, insurance and parcel liability (legal review, DECIDE).
H6 P1 Installable web app (PWA), offline map caching for drivers, accessibility (contrast, labels, large touch targets).
H7 P2 Languages and currencies for new regions. Public API docs. Status page.
H8 P1 Name and brand checks for SenDexk, domain, social handles.

## I. Pilot readiness
I1 P0 Seed data and demo accounts that never reach production.
I2 P1 Pilot playbook: first suburbs and first five businesses (DECIDE), onboarding checklist, support rota, daily review, success metrics.
I3 P1 Ten-store delivery rate check (docs/09_STORE_RATE_CHECK.md) to set real price levels.
I4 P1 Real provider accounts: payments, SMS, WhatsApp, maps/geocoder.
