# PROGRESS: living handoff (update every session)

Platform name: **SenDexk** (chosen 2026-10-26; availability not yet checked).

## Current state (2026-10-29)

Branch `feat/skeleton` — **PR open, do not merge without review.**

146 tests pass (74 existing + 72 new word-ban tests).
Journey A→G passes. 18 Playwright screenshots saved to `docs/screens/`.

### What was built this session (feat/skeleton)

**Stage 1 — Real business identity (src/auth.js, server.js)**
- Business OTP login: phone → 6-digit code → `biz_session` HttpOnly cookie (8h).
- Store API keys: `createStoreKey` (random 32-byte key shown once, SHA-256 hash stored), `revokeKey`.
- `businessFromRequest` resolves either the cookie or `x-api-key` header.
- Isolation tests: one business cannot read or spend another's wallet.

**Stage 2 — Payment provider interface (src/payments.js)**
- `fakeAdapter()` with `createLink`, `verifyWebhook` (HMAC-SHA256), `complete()` test helper.
- Duplicate-safe: same `orderId` returns the same link; duplicate webhook returns `{ duplicate: true }`.
- Journey test drives the full payment → webhook → ledger flow.

**Stage 3 — Rebuilt public/ (all pages)**
- `app.css` — design tokens matching docs/DESIGN.md (CSS vars, Manrope, 390px mobile-first).
- `index.html` — MapLibre map, bottom sheet, suburb chips, wallet pill.
- `choose.html` — route line, time windows, vehicle cards with real prices from `/api/quote`.
- `pay.html` — recipient details, wallet/card/EFT selector, creates order and payment link.
- `track.html` — live driver map, status steps, delivery code display, polls every 8s.
- `driver.html` — phone OTP login, trip offer (earn amount + stops), accept/decline, stop-by-stop with 4-digit code entry.
- `admin.html` — sidebar nav (Live trips / Orders / Drivers / Businesses / Money / Messages), stat tiles, live map, trips table, ledger check.
- `business.html` — OTP login via biz_session cookie, wallet balance, top-up buttons, statement, API key creation.
- `store-pay.html` — store checkout link: loads spec by token, draggable drop-off pin, confirm delivery.
- `confirm.html` — recipient confirms map pin, gets 4-digit code, redirects to track.html.

**Stage 4 — Playwright screenshots**
- 18 screenshots (9 pages × 2 widths: 390px and 1280px) saved to `docs/screens/`.

**Stage 5 — Gaps rewritten**
- `docs/GAPS.md` rewritten with 8 verified claims ranked by pilot-blocking priority.

## Gaps blocking a real pilot (see docs/GAPS.md for details)
1. SMS / WhatsApp adapters are fake — no real messages sent.
2. Payment provider is fake — no real money moves.
3. Map tiles require a manual download step.

## Next step (one action)
Review and merge the `feat/skeleton` pull request on GitHub.
After merge: the next tasks are (in order):
1. Wire real SMS adapter (Twilio or similar) — unblocks notifications.
2. Wire real payment adapter (Peach Payments or Ozow) — unblocks money flow.
3. Field-test pricing with real drivers — unblocks a proper launch.

## Notes for the next agent
- Node 24, zero npm production deps (`playwright` is devDep only).
- All public pages use `app.css` design tokens; MapLibre 4.7.1 + PMTiles 3.2.1.
- Business routes require `biz_session` cookie (POST `/api/business/otp` → `/api/business/verify`).
- Store routes accept either the cookie or `x-api-key` header (Bearer token removed from business routes).
- Driver routes accept `Authorization: Bearer <token>` from `/api/driver/otp` → `/api/driver/verify`.
- `src/payments.js` is the payment adapter layer; swap `fakeAdapter` for a real one via env var.
- `docs/screens/` contains reference screenshots for UI regression checks.
- `test/words.test.js` scans public/*.html for banned words from docs/DESIGN.md.
- The user is a beginner. Explain each step. Never push to main.
