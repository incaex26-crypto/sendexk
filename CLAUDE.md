# CLAUDE.md: read this first, every session

You are helping a **beginner** (Dumisani, Johannesburg) build a same-day delivery marketplace for independent drivers in dense urban areas. Explain things in plain words, one step at a time, and never assume he knows git, the terminal or hosting.

## Start of every session (do this, in order)
1. Read `docs/PROGRESS.md`: it says what was done, what is next, and what is blocked.
2. Read `docs/03_DECISIONS.md` so you do not re-open settled choices.
3. Run `npm test`. If it fails, fix that before anything else.
4. Tell the user in 3 lines: where we are, what you will do now, what you need from him (if anything).

## End of every session (or when you sense usage is running low)
1. Run `npm test`. Commit with a clear message on the current branch.
2. Update `docs/PROGRESS.md` (use `/handoff`). Another agent must be able to continue with no other context.
3. Never leave the repo with failing tests or half-written files on `main`.

## Project in one paragraph
Businesses and individuals book same-day pickup and delivery. The recipient must confirm a map pin before anything is collected. Parcels are batched into runs. Drivers (petrol or electric, motorbike/car/van) accept runs. Price comes from the accepting vehicle's fuel or power use, wear, time and handling. Money is a double-entry ledger in whole cents. Full brief: `docs/01_PROJECT_BRIEF.md`. Design: `docs/02_ARCHITECTURE.md`.

## Rules that must not be broken
- Money is whole cents (integers). Every ledger transaction sums to zero.
- All order status changes go through `src/statemachine.js` and `src/service.js`, and write an event.
- Unconfirmed parcels are never dispatched.
- Business never pays above the cap shown at booking.
- No secrets in the repo. Use environment variables. Never print tokens.
- Region differences live in `config/regions/*.json`, not in code. No city names or currency symbols in `src/`.
- Prices in `za-jhb.json` are illustrative until the user replaces them with measured values.
- Do not add dependencies unless needed. Ask first, and say why in plain words.
- One task per fresh session. Default model Sonnet. Read only files named in the task. No subagents unless the owner asks. Never change `scripts/gate.js`, `scripts/autopilot.sh` or `.claude/` in a normal task.

## How to work
- Small steps: one task, one branch (`feat/<name>`), tests first or alongside, then a pull request.
- Run `npm test` before every commit. Add a test for every rule you add.
- Keep files short and named for what they do. Comment the why, not the what.
- When unsure about a business choice (pricing, legal, payments), do not guess: add it to `docs/03_DECISIONS.md` under Open and ask.
- When blocked by usage limits or missing access, stop cleanly: update `docs/PROGRESS.md`, commit, and follow `docs/06_AGENT_WORKFLOW.md`.

## Commands
`npm test` · `npm run simulate` · `npm run seed` · `npm start` (http://localhost:3000, admin key `dev-admin`) · `npm run new-region`

## Slash commands in `.claude/commands/`
`/pickup` start-of-session routine · `/handoff` end-of-session notes · `/status` plain-language progress · `/test-all` tests + simulator + summary · `/ship` tests + rules check + commit + push + pull request · `/ask-decision` record a business question under Open

## Automations (in `.claude/`, tested in `test/hooks.test.js`)
- Hooks in `.claude/settings.json`: block `git commit`/`git push` on main or to main; block reading or editing secret files (`.env`, keys); run `npm test` when a turn ends and send Claude back once if it fails.
- Subagent `rules-checker` (`.claude/agents/`): read-only review of changes against the rules above. Run it before every pull request (`/ship` does).
