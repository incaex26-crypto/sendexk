# PROGRESS: living handoff (update every session)

Platform name: **SenDexk** (chosen 2026-10-26; availability not yet checked).

## Current state (2026-10-28)
- Working starter app: pricing (petrol/electric), batching with profit check, state machine, ledger, hotspots, ETA, API, 4 simple pages, seeded day simulator.
- **Driver phone login (OTP) built** on branch `feat/driver-otp-login` (not yet pushed or merged). 52 tests pass.
- Automations merged into main (PR #1): hooks (no commits on/to main, no secret files, `npm test` at end of turn), `/ship`, `/ask-decision`, `rules-checker` subagent.
- Repo on GitHub (`incaex26-crypto/sendexk`), dev environment is a Codespace with Claude Code. Graphify installed (graph in `graphify-out/`, ignored by git).
- Everything money-related is a mock. Prices are illustrative.

## Done this session (2026-10-27)
- Automations (PR #1, merged).
- Driver login: `src/auth.js` (codes, sessions), `src/phone.js` (normalise numbers from region `phone` config), tables `otps` and `sessions`, routes `POST /api/auth/otp|verify|logout`, driver routes take `Authorization: Bearer <token>`, the `x-driver-id` header is gone, `POST /api/drivers` is admin-only, driver page has phone + code login and Log out.
- Defaults chosen (user may change): code 6 digits, lasts 5 min, 5 wrong tries, max 3 codes per phone per 15 min; session 30 days.
- No SMS provider yet: the code is shown on screen only when `OTP_DEV_CODES=1` (set by `npm run dev` and the API tests) and never when `NODE_ENV=production`. `npm start` refuses with 503.
- rules-checker review done; its 2 problems fixed (codes now opt-in instead of shown by default; tests added for the production refusal and the other-region 403).

## Done 2026-10-28
- **Full UI redesign** on `feat/ui-v1` (PR #5 open): calm layout, generous whitespace, amber accent, dark mode, no gradients.
- **Driver OTP login** merged from `feat/driver-otp-login` into `feat/ui-v1`. Phone number → 6-digit code → 30-day session token. No SMS yet — code shown on screen only in dev mode (`OTP_DEV_CODES=1`).
- **Booking page** (`index.html`): 4-step wizard (addresses → parcel → delivery window → pay). One firm price shown (cap). MapLibre draggable pins, suburb select fallback.
- **Tracking page** (`track.html`): new page. Status, driver first name, ETA window, delivery code, live map.
- **Driver page** (`driver.html`): phone OTP login, map-first (50 vh), open runs show total pay + km before accepting, step-by-step stop screens, delivery-code entry.
- **Admin/ops page** (`admin.html`): live map (driver markers), stats, order list with status filters, plain action labels (Assign runs / Expire unconfirmed / Process earnings).
- **Playwright screenshots** at 390 px and 1280 px for all 5 pages — zero console errors. Screenshots in `docs/screens/`.
- Tests: **60 pass, 0 fail** (was 47 before OTP + UI work; added 13 OTP auth tests).
- `scripts/screenshots.js` added; `npm run screenshots` to regenerate.

## Next step (one action)
Review and merge PR #5 (`feat/ui-v1`) on GitHub, then decide on an SMS provider so OTP codes are actually sent (add to `docs/03_DECISIONS.md` Open as decision 15).

## Blocked / waiting on the user
- Merge PR #5.
- Choose an SMS/WhatsApp provider (Twilio, Africa's Talking, etc.) — needed for real OTP delivery.
- Decide: pilot suburbs and first 5 businesses (Open item 3); payment provider (Open item 6).

## Notes for the next agent
- Node 22.5+; run with `--disable-warning=ExperimentalWarning` (npm scripts do).
- To try the full app: `npm run seed`, `npm run dev` (http://localhost:3000). Driver login phone: `0710000000`.
- Customer nav shows only "Book a delivery" and "Track"; driver/admin pages at `/driver.html` and `/admin.html`.
- `get-map.js` falls back to up to 3 days old if today's Protomaps build is not ready.
- Follow-ups not done: per-IP OTP rate limit; driver session revocation; cleanup of old OTP rows.
- Admin key is still the shared `ADMIN_KEY = 'dev-admin'` (Phase 1). Never commit secrets.
- The user is a beginner. Explain each step. Never push to main.
