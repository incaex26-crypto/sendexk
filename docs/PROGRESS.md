# PROGRESS: living handoff (update every session)

Platform name: **SenDexk** (chosen 2026-10-26; availability not yet checked).

## Current state (2026-10-27)
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

## Next step (one action)
Push `feat/driver-otp-login` and open a pull request (ask the user first, or they run `/ship`).
Then Phase 1 next task: SMS/WhatsApp sending behind one small function (needs provider choice: ask the user; add to `03_DECISIONS.md` Open), so codes and confirmation links are really sent.

## Blocked / waiting on the user
- Review and merge the driver login pull request.
- Decide: pilot suburbs and first 5 businesses (Open item 3); payment provider (Open item 6); SMS provider (not yet listed).

## Notes for the next agent
- Node 22.5+; run with `--disable-warning=ExperimentalWarning` (npm scripts do).
- To try the app with login: `npm run seed`, then `npm run dev`, driver page, phone `0710000000`.
- Follow-ups from the login review (not done): per-IP rate limit (anyone can lock a driver out by asking for 3 codes every 15 min); a way to cancel all of a driver's sessions (suspension); cleanup of old `otps`/`sessions` rows (privacy). Admin login is still the shared `ADMIN_KEY` (Phase 1).
- Map commands in docs/05 are unrun. Run and correct them in Phase 2.
- The user is a beginner. Explain each step. Never push to main.
- Phase 1b depends on the open item that stores keep a margin or not (decision 11); build it so the commission is a config value that can be zero.
