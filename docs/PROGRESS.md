# PROGRESS: living handoff (update every session)

Platform name: **SenDexk** (chosen 2026-10-26; availability not yet checked).

## Current state (2026-10-29)

Branch `main` has PR #15 (feat/skeleton) merged.  
Branch `feat/spec-coverage` (PR #16) is **open — do not merge without review.**

**On main:** 146 tests pass · journey A→G passes · 18 Playwright screenshots in `docs/screens/`  
**On feat/spec-coverage:** 165 tests pass · 2 journey tests pass

### What is built (feat/skeleton, merged to main)

- Business OTP login → `biz_session` HttpOnly cookie (8h)
- Store API keys: random 32-byte key shown once, SHA-256 hash stored, revocable
- Payment provider interface (`src/payments.js`): fake adapter with `createLink`, `verifyWebhook`, duplicate-safe
- Full public UI: index, choose, pay, track, driver, admin, business, store-pay, confirm pages
- Live tracking page with 8s poll, status dots, driver map pin during delivery
- Playwright screenshots (9 pages × 2 widths: 390px and 1280px)

### What is built (feat/spec-coverage, PR #16 open)

- Driver onboarding: documents, vehicle, approval workflow (`driver_documents` table)
- Weekly driver statement (`driverWeeklyStatement`, GET /api/driver/statement)
- Cancellations through ledger (`cancelOrder`, POST /api/orders/:id/cancel)
- Proof of delivery photo stand-in (`recordDeliveryPhoto`)
- Store plugin spec endpoint (GET /api/store/plugin/woocommerce)
- Settings editor for pricing/platform share (`platform_settings` table, GET/PUT /api/admin/settings/:key)
- Driver approvals and dispute queue (`disputes` table, `pendingApprovals`, `openDispute`, `resolveDispute`)
- 19 new tests in test/payments.test.js and test/stage3.test.js

## Gaps blocking a real pilot

1. **SMS / WhatsApp adapters are fake** — no real messages sent. Swap adapters when `TWILIO_SID` / `META_WA_TOKEN` env vars are set.
2. **Payment provider is fake** — no real money moves. Implement `src/adapters/peach-payments.js` (or Ozow/Stitch) behind the same interface.
3. **Map tiles require a manual download step** — run `pmtiles extract …` once per environment (commands in `docs/SPEC.md`).
4. **Region pricing is illustrative** — replace values in `config/regions/za-jhb.json` with real driver measurements.
5. **Driver location is polled** — add SSE endpoint for real-time updates before launch.
6. **Admin password set via CLI arg** — change `create-admin.js` to read from env var or prompt interactively.
7. **No schema migration runner** — add numbered SQL files in `migrations/` before any schema change in production.
8. **Store key list endpoint missing** — `GET /api/store/keys` not yet implemented (POST to create and DELETE to revoke exist).

## Next steps (in order)

1. Review and merge `feat/spec-coverage` (PR #16).
2. Wire real SMS adapter (Twilio or similar) — unblocks notifications.
3. Wire real payment adapter (Peach Payments or Ozow) — unblocks money flow.
4. Download real map tiles and verify all public pages.
5. Field-test pricing with 5–10 real drivers (4–6 weeks) — replace illustrative values in `za-jhb.json`.
6. Legal review: driver contractor status, liability caps, POPIA notice, terms of service.
7. Run the 10-store delivery-rate check (see `docs/DECISIONS.md`) to fix the price ceiling and store commission.

## Notes for the next agent

- Node 24, zero npm production deps (`playwright` is devDep only).
- All public pages use `app.css` design tokens; MapLibre 4.7.1 + PMTiles 3.2.1.
- Business routes require `biz_session` cookie (POST `/api/business/otp` → `/api/business/verify`).
- Store routes accept either the cookie or `x-api-key` header.
- Driver routes accept `Authorization: Bearer <token>` from `/api/driver/otp` → `/api/driver/verify`.
- `src/payments.js` is the payment adapter layer; swap `fakeAdapter` for a real one via env var.
- `docs/screens/` contains reference screenshots for UI regression checks.
- `test/words.test.js` scans `public/*.html` for banned words from `docs/DESIGN.md`.
- `docs/SPEC.md` has the full feature list and status. `docs/DECISIONS.md` has all open questions.
- The user is a beginner. Explain each step. Never push to main.
