# PROGRESS: living handoff (update every session)

Platform name: **SenDexk** (chosen 2026-10-26; availability not yet checked).

## Current state (2026-10-27)
- Working starter app: pricing (petrol/electric), batching, state machine, ledger, hotspots, ETA, API, 4 pages, seeded day simulator.
- **Automations merged** (PR #1): hooks (no commits on/to main, no secret files, `npm test` at end of turn), `/ship`, `/ask-decision`, `rules-checker`.
- **Driver phone login (OTP)** built on branch `feat/driver-otp-login` (PR #2 open, not merged). 52 tests. No SMS provider yet.
- **Phase 1 payments** built on branch `feat/payments-sandbox` (PR #3 open, not merged). 57 tests. Ledger balanced.
- Repo on GitHub (`incaex26-crypto/sendexk`), dev environment is a Codespace with Claude Code.
- Everything money-related uses a sandbox provider. Prices are illustrative.

## Done this session (2026-10-27)
- Evaluated Ponytail and OmniRoute plugins; both skipped. Notes in `docs/07_PLUGINS_AND_TOOLS.md`.
- Built Phase 1 payments (`feat/payments-sandbox`, PR #3):
  - `src/payments.js`: provider interface + sandbox (swap `PAYMENT_PROVIDER` env var for Paystack/PayFast).
  - Individual card orders: `POST /api/orders/:id/paylink` → provider URL. `POST /api/webhook/payment` → verifies `x-signature`, idempotent.
  - Business wallet: `topUp`, `walletBalance`; `createOrder` checks wallet ≥ cap, reserves into escrow, advances to `awaiting_confirmation`. Cap surplus on delivery returns to wallet.
  - `cancelOrder`: escrow → wallet (business) or escrow → `refund_due` (card).
  - DB: `payment_ref`, `payment_type` columns; migration for existing DBs.
  - Simulator topped up with 2 000 000 cents per shop so the seeded day still runs.
  - Rules-checker found 2 problems (both Rule 6 currency symbols); both fixed before PR.

## Next step (one action)
Choose a real SMS/WhatsApp provider to send OTP codes (needed for `feat/driver-otp-login` to go live).
Options: Vonage (Nexmo), Twilio, Africa's Talking (cheapest for ZA), or BulkSMS.
**Ask the user before picking one.** Add to `docs/03_DECISIONS.md` Open.

Then after both PRs are merged:
- Wire up a real payment provider (Paystack for ZA) behind the `payments.js` interface.
- Add per-IP rate limiting to OTP endpoint.

## Blocked / waiting on the user
- Review and merge PR #2 (driver OTP login).
- Review and merge PR #3 (payments sandbox).
- Decide: SMS/WhatsApp provider for OTP (Open item — add to decisions).
- Decide: real payment provider (Paystack/PayFast?).

## Notes for the next agent
- Node 22.5+; run with `--disable-warning=ExperimentalWarning` (npm scripts do).
- To try the app with login: `npm run seed`, then `npm run dev`, driver page, phone `0710000000`.
- Payments sandbox: `WEBHOOK_SECRET=dev-webhook-secret` (set in `npm run dev`). Real webhook needs env var in production.
- Follow-ups from OTP review (not done): per-IP rate limit, revoke all sessions, clean up old otps/sessions rows, admin login.
- Map commands in `docs/05` are unrun. Run and correct them in Phase 2.
- The user is a beginner. Explain each step. Never push to main.
- Phase 1b commission rate lives in region config as `platformShare`; already configurable, can be zero.
