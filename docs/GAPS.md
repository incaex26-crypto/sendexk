# GAPS.md — shortcuts taken in this build

These are the things that work in tests and demos but are not production-ready.
Each item says what the shortcut is, why it was done, and what needs to happen before going live.

---

## 1. Business / store identity uses a header, not a phone OTP

**Shortcut:** `x-account-id` and `x-store-id` request headers identify the business.
Any caller who knows the account ID can act as that business.

**Why:** OTP login for businesses was out of scope for this stage.

**What to do:** Wire business accounts through the same OTP flow as drivers.
Add a `createSession(db, 'business', accountId)` path in `src/auth.js` and
replace the `accountOf()` helper in `server.js` with proper session middleware.

---

## 2. Payment sandbox: no real money moves

**Shortcut:** `POST /api/orders/:id/pay` marks an order as paid with no external call.
The ledger records the transaction correctly, but no real payment provider is wired.

**Why:** A real payment integration (Peach Payments, Ozow, etc.) needs API keys,
webhook validation, and a sandbox account — none of which are in this repo.

**What to do:** Add a `src/payments.js` adapter behind the same interface as `src/notify.js`.
Fake adapter is default; swap in a real one via env var. Webhook endpoint validates
signatures and calls `markPaid` once confirmed.

---

## 3. SMS and WhatsApp adapters are fake

**Shortcut:** All three channel adapters (WhatsApp, SMS, email) in `src/notify.js`
store messages in an in-memory `outbox` array only. Nothing is actually sent.

**Why:** Real adapters need API keys (Twilio, Meta Cloud API) and are billed per message.

**What to do:** Write a `src/adapters/twilio-sms.js` and `src/adapters/meta-whatsapp.js`
behind the same `send({ address, from, body })` interface. Load them when
`TWILIO_SID` / `META_WA_TOKEN` env vars are present. The `notify()` function
already routes correctly; only the adapter needs swapping.

---

## 4. Map tiles require a manual download step

**Shortcut:** The offline map (MapLibre + PMTiles) requires running `node scripts/get-map.js`
before the map renders on any page. Without the tile file, the map silently fails.

**Why:** The tile file is ~200 MB and cannot be checked into the repo.

**What to do:** Document the tile download in the README and `onboarding.md`.
In production, serve tiles from a CDN or use a hosted tile service and remove
the download step.

---

## 5. Admin password is set in plaintext during seeding

**Shortcut:** `node scripts/create-admin.js` takes the password on the command line.
This is fine for dev but terminal history can leak it.

**Why:** No interactive TTY in the dev container.

**What to do:** Have `create-admin.js` prompt interactively (`readline`) or read from
`ADMIN_PASSWORD` env var, and document that the env var must not be logged.

---

## 6. Region pricing values are illustrative

**Shortcut:** All prices in `config/regions/za-jhb.json` (fuel cost, wear rates, cap amounts)
are rough estimates based on public fuel-price data.

**Why:** Real measured values require field trials with real drivers on real routes.

**What to do:** Run a 4–6 week pilot with 5–10 drivers. Record actual fuel/electricity
spend, actual delivery times, and driver satisfaction with the payout. Then replace
the estimates in `za-jhb.json` with measured values before public launch.

---

## 7. Driver location is polled, not pushed

**Shortcut:** The driver pings location via `POST /api/driver/ping`. The admin map
refreshes every 10 seconds by polling. There is no real-time push.

**Why:** WebSockets or SSE require a persistent connection, which complicates the
zero-npm-dep constraint.

**What to do:** Add a lightweight SSE endpoint (`GET /api/admin/events`) and update
the admin page to subscribe. Driver location can remain a poll from the driver app,
since the driver sends pings anyway.
