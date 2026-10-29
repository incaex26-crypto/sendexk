# PROGRESS: living handoff (update every session)

Platform name: **SenDexk** (chosen 2026-10-26; availability not yet checked).

## Current state (2026-10-26)
- Working starter app: pricing (petrol/electric), batching with profit check, state machine, ledger, hotspots, ETA, API, 4 simple pages, seeded day simulator. 35 tests pass.
- Interactive demo published as an artifact (see docs/01_PROJECT_BRIEF.md).
- Repository documentation written. **Repo not yet created on GitHub by the user.**
- Everything money-related is a mock. Prices are illustrative.

## Money and pricing design settled (2026-10-26 afternoon)
See Settled in `03_DECISIONS.md` and Phase 1b in `04_ROADMAP.md`. Not yet built. Tests still 35 passing because no code changed.

## Done this session
- Wrote CLAUDE.md, AGENTS.md, slash commands, CI, docs 00-08.
- Researched: Claude Code in the cloud setup, plugin install commands, PMTiles extract and serve commands.

## Automations added (2026-10-27, branch `chore/automations`, not merged)
- Hooks (`.claude/settings.json` + `.claude/hooks/*.js`): no commits/pushes on or to main; no reading/editing secret files; `npm test` at end of each turn.
- Commands `/ship` and `/ask-decision`; subagent `rules-checker`. `graphify-out/` added to `.gitignore`.
- 39 tests pass (4 new in `test/hooks.test.js`). Waiting on the user to review and merge the pull request.
- Environment done: project is in the Codespace and Claude Code runs there; Graphify installed (graph built locally in `graphify-out/`).

## Environment status (2026-10-27)
User created GitHub repo `sendexk` (account incaex26-crypto) and opened a Codespace (Node v24.21.0, Git present). Work laptop blocks installs, so the Codespace is the dev environment. Next: upload this project into the Codespace, run `npm test`, then install Claude Code extension and sign in, then plugins one at a time in this order: Claude Code Setup, Graphify (`uv tool install graphifyy`, `graphify install`), Agent Skills (`/plugin marketplace add anthropics/skills`), Ponytail (on a branch; source unverified), OmniRoute last (set INITIAL_PASSWORD first, fallback use only, never global ANTHROPIC_BASE_URL). Plugins do not run in claude.ai/code cloud sessions.
The user wants instructions given ONE small action at a time (beginner).

## Next step (one action)
User follows `docs/00_START_HERE.md` steps 1-5, then starts a cloud session with `/pickup`.
After that: Phase 1 first task = "driver phone login (OTP) with tests". Safe to start only after the user confirms the open decisions 1-3 in `03_DECISIONS.md` are not blocking (they do not block Phase 1).

## Blocked / waiting on the user
- Create GitHub account and repo; connect Claude (guide steps 1-4).
- Decide: service area suburbs; individuals' pricing method; platform name.

## Files touched
All of `docs/`, `CLAUDE.md`, `AGENTS.md`, `.claude/commands/`, `.github/workflows/test.yml`, `.gitignore`.

## Notes for the next agent
- Node 22.5+; run with `--disable-warning=ExperimentalWarning` (npm scripts do).
- Map commands in docs/05 are unrun. Run and correct them in Phase 2.
- The user is a beginner. Explain each step. Never push to main.
- Phase 1b depends on the open item that stores keep a margin or not (decision 11); build it so the commission is a config value that can be zero.

## T1 Security hardening (done, branch feat/t1)
- `src/auth.js`: admin_users (scrypt + 16-byte salt), sessions (hashed 32-byte token, 8h, HttpOnly SameSite=Strict cookie), phone OTP with SQLite rate limits, admin login lock, `suspendDriver`, hourly `cleanup`.
- Admin key is gone. Create an admin: `ADMIN_PASSWORD='...' node scripts/create-admin.js you@example.com`. Login screen is in `public/admin.html`.
- Driver routes accept `Authorization: Bearer <token>` from `/api/driver/otp` + `/api/driver/verify`; the old `x-driver-id` header still works (dev only) but suspended drivers are refused.
- OTP code is returned as `devCode` outside production; a real SMS provider is still to be chosen.
- Tests: `test/auth.test.js`.

## Ecosystem build — stage 1 & 2 (done, branch feat/ecosystem, PR open)
**PR open — do not merge without review.**

74 tests pass, including new `test/journey.test.js` (2 tests: A→G journey + schema upgrade).

### What was built
- **Business wallet** (`src/service.js`): `walletTopup`, `walletBalance`, `walletStatement`, `walletPayOrder`. Double-entry ledger; every transaction balances to zero.
- **Store checkout links** (`src/service.js`, `src/db.js`): `createQuoteLink`, `previewQuoteLink`, `redeemQuoteLink`. Token expires in 30 min; one-time use; shopper-pays and wallet-mode.
- **Driver earnings** (`/api/driver/earnings`): ledger entries, run history, payout history.
- **Admin suspend** (`/api/admin/drivers/:id/suspend`): logs driver out everywhere immediately.
- **Notification log** (`/api/admin/notifications`): full outbox readable by admin.
- **Notifications wired** into `markPaid` (payment_received, booking_confirmed), `acceptRun` (driver_assigned), and scan actions (out_for_delivery, delivered).
- **UI pages**: `public/business.html` (wallet + statement), `public/pay.html` (store checkout map), driver earnings tab, admin drivers + notifications tabs.
- `npm run journey` runs the A→G journey test in DEV mode.
- `docs/GAPS.md` documents 7 production shortcuts.

### Gaps (see docs/GAPS.md)
1. Business identity uses `x-account-id` header — needs real phone OTP login.
2. Payment is sandbox only — no real payment provider.
3. SMS / WhatsApp adapters are fake — adapters need real API keys.
4. Map tiles require manual download.
5. Admin password set in plaintext on command line.
6. Pricing values are illustrative (need field data).
7. Driver location is polled, not pushed.

## Next step (one action)
Review and merge PR `feat/ecosystem` on GitHub. After merge, the next task from the backlog is T3 (Recipient map-pin confirmation flow) or T4 (Driver phone OTP login).
