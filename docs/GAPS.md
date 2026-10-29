# GAPS.md — verified shortcuts in this build

Ranked by what blocks a real pilot. Each item says what is missing,
what was verified in tests, and what must happen before going live.

---

## 1. SMS and WhatsApp adapters are fake (BLOCKS PILOT)

**Verified:** All three channel adapters (WhatsApp, SMS, email) in `src/notify.js`
write to an in-memory `outbox` array. Nothing is actually sent to any phone.
Tests pass because they read from `outbox` directly.

**What to do before launch:** Write `src/adapters/twilio-sms.js` and
`src/adapters/meta-whatsapp.js` behind the same `send({ address, from, body })`
interface. Load them when `TWILIO_SID` / `META_WA_TOKEN` env vars are present.
The `notify()` function already routes correctly; only the adapter needs swapping.

---

## 2. Payment provider is a fake adapter (BLOCKS PILOT)

**Verified:** `src/payments.js` ships a fake adapter. `createLink` returns a
local redirect URL. `verifyWebhook` accepts the hard-coded signature `'fake-sig'`.
The ledger records transactions correctly and the journey test exercises the full
webhook flow using the fake adapter.

**What to do before launch:** Implement `src/adapters/peach-payments.js` (or
Ozow / Stitch) behind the same `{ createLink, verifyWebhook }` interface. Load it
when `PAYMENT_API_KEY` env var is present. Webhook endpoint already validates
signatures via `verifySig` (HMAC-SHA256) — only the key and endpoint URL differ.

---

## 3. Map tiles require a manual download step (BLOCKS DEMO)

**Verified:** MapLibre + PMTiles renders correctly when `data/maps/jhb.pmtiles`
exists. All public pages gracefully show a blank background when the file is absent.
Screenshots were taken with no tile file — pages render and are usable, just without
the real map.

**What to do before launch:** Run `node scripts/get-map.js` once per deployment
environment, or serve tiles from a CDN and set `map.tilesUrl` in the region config.

---

## 4. Region pricing values are illustrative

**Verified:** All prices in `config/regions/za-jhb.json` (fuel cost, wear rates,
cap amounts) are rough estimates. The pricing formula itself passes all tests.

**What to do before launch:** Run a 4–6 week pilot with 5–10 drivers. Record actual
fuel and electricity spend, delivery times, and driver satisfaction. Replace the
estimates in `za-jhb.json` with measured values before public launch.

---

## 5. Driver location is polled, not pushed

**Verified:** Driver pings location via `POST /api/driver/ping`. Admin map refreshes
every 10 seconds by polling. Journey test verifies the ping endpoint works.

**What to do before launch:** Add a lightweight SSE endpoint (`GET /api/admin/events`)
for real-time driver position updates. The driver app can continue to POST pings.

---

## 6. Admin password set via command line (security hygiene)

**Verified:** `node scripts/create-admin.js` takes the password as a command-line
argument. The password is hashed with scrypt before storing; the raw value only
appears in terminal history.

**What to do before launch:** Have `create-admin.js` read from `ADMIN_PASSWORD` env var
or prompt interactively, and document that the env var must not be logged.

---

## 7. Database schema migration is not automated

**Verified:** `src/db.js` runs `CREATE TABLE IF NOT EXISTS` on every start. New columns
are not added to existing tables. Any schema change requires manual migration.

**What to do before launch:** Add a lightweight migration runner (numbered SQL files
in `migrations/`) that runs on startup and is idempotent. Tests already cover that
a fresh database seeds correctly.

---

## 8. Store key list endpoint not yet implemented

**Verified:** `POST /api/store/keys` creates a key; `DELETE /api/store/keys/:id`
revokes one. There is no `GET /api/store/keys` to list active keys. The business
wallet page shows a placeholder for this.

**What to do:** Add `GET /api/store/keys` returning non-revoked keys for the
authenticated business (without the raw key value, which is never stored).
