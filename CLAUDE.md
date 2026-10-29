# CLAUDE.md: read this first, every session

You are helping a **beginner** (Dumisani, Johannesburg) build a same-day delivery marketplace for independent drivers in dense urban areas. Explain things in plain words, one step at a time, and never assume he knows git, the terminal or hosting.

## Start of every session (do this, in order)
1. Read `docs/PROGRESS.md`: it says what was done, what is next, and what is blocked.
2. Read `docs/DECISIONS.md` so you do not re-open settled choices.
3. Run `npm test`. If it fails, fix that before anything else.
4. Tell the user in 3 lines: where we are, what you will do now, what you need from him (if anything).

## End of every session (or when you sense usage is running low)
1. Run `npm test`. Commit with a clear message on the current branch.
2. Update `docs/PROGRESS.md` (use `/handoff`). Another agent must be able to continue with no other context.
3. Never leave the repo with failing tests or half-written files on `main`.

## Project in one paragraph
Businesses and individuals book same-day pickup and delivery. The recipient must confirm a map pin before anything is collected. Parcels are batched into runs. Drivers (petrol or electric, motorbike/car/van) accept runs. Price comes from the accepting vehicle's fuel or power use, wear, time and handling. Money is a double-entry ledger in whole cents. Full spec: `docs/SPEC.md`. Design tokens: `docs/DESIGN.md`.

## Rules that must not be broken
- Money is whole cents (integers). Every ledger transaction sums to zero.
- All order status changes go through `src/statemachine.js` and `src/service.js`, and write an event.
- Unconfirmed parcels are never dispatched.
- Business never pays above the cap shown at booking.
- No secrets in the repo. Use environment variables. Never print tokens.
- Region differences live in `config/regions/*.json`, not in code. No city names or currency symbols in `src/`.
- Prices in `za-jhb.json` are illustrative until the user replaces them with measured values.
- Do not add dependencies unless needed. Ask first, and say why in plain words.
- One task per fresh session. Default model Sonnet. Read only files named in the task. No subagents unless the owner asks. Never change `.claude/` in a normal task.

## How to work
- Small steps: one task, one branch (`feat/<name>`), tests first or alongside, then a pull request.
- Run `npm test` before every commit. Add a test for every rule you add.
- Keep files short and named for what they do. Comment the why, not the what.
- When unsure about a business choice (pricing, legal, payments), do not guess: add it to `docs/DECISIONS.md` under Open and ask.
- When blocked by usage limits or missing access, stop cleanly: update `docs/PROGRESS.md` and commit.

## Architecture (modular monolith, zero build step)

```
config/regions/*.json   city-specific: zones, vehicles, prices, cut-offs
src/pricing.js          cost per vehicle, quote cap, profit check
src/batching.js         confirmed parcels → ordered runs
src/statemachine.js     legal state transitions (only place order status changes)
src/service.js          all actions (book, pay, confirm, dispatch, accept, scan, payout)
src/ledger.js           double-entry money in whole cents, every transaction sums to zero
src/auth.js             admin, driver OTP, business OTP, store API keys
src/payments.js         payment adapter layer (fake; swap for real via PAYMENT_API_KEY)
src/notify.js           notification routing (WhatsApp/SMS/email adapters; fake in dev)
src/db.js               SQLite schema init (node:sqlite, no ORM)
server.js               node:http routes; region loaded per request
public/                 HTML pages (index, choose, pay, track, driver, admin, business, store-pay, confirm)
```

Key facts: Node 24, zero npm production dependencies, CommonJS (not ESM), plain `node:http`, `node:sqlite` (DatabaseSync), `node --test` runner.

## Testing

```
npm test          # unit + integration: pricing, rules, flow, HTTP API, word-ban, auth, payments, stage3
npm run journey   # full end-to-end HTTP journey (order → payment → confirm → dispatch → deliver)
npm run simulate  # full simulated day printed as a report
```

Every feature needs a test. Test files live in `test/`. Helper: `test/helpers.js` exports `setup()` (isolated DB), `P()` (HTTP POST), `order()` (shortcut for a booked order). Word-ban test (`test/words.test.js`) scans `public/*.html` for banned words listed in `docs/DESIGN.md`.

## Commands
`npm test` · `npm run journey` · `npm run simulate` · `npm run seed` · `npm start` (http://localhost:3000, admin key `dev-admin`) · `npm run new-region`

## Slash commands in `.claude/commands/`
`/pickup` start-of-session routine · `/handoff` end-of-session notes · `/status` plain-language progress · `/test-all` tests + simulator + summary · `/ship` tests + rules check + commit + push + pull request · `/ask-decision` record a business question under Open

## Automations (in `.claude/`, tested in `test/hooks.test.js`)
- Hooks in `.claude/settings.json`: block `git commit`/`git push` on main or to main; block reading or editing secret files (`.env`, keys); run `npm test` when a turn ends and send Claude back once if it fails.
- Subagent `rules-checker` (`.claude/agents/`): read-only review of changes against the rules above. Run it before every pull request (`/ship` does).
