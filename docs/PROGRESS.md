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

## Environment status (2026-10-27)
User created GitHub repo `sendexk` (account incaex26-crypto) and opened a Codespace (Node v24.21.0, Git present). Work laptop blocks installs, so the Codespace is the dev environment. Next: upload this project into the Codespace, run `npm test`, then install Claude Code extension and sign in, then plugins one at a time in this order: Claude Code Setup, Graphify (`uv tool install graphifyy`, `graphify install`), Agent Skills (`/plugin marketplace add anthropics/skills`), Ponytail (on a branch; source unverified), OmniRoute last (set INITIAL_PASSWORD first, fallback use only, never global ANTHROPIC_BASE_URL). Plugins do not run in claude.ai/code cloud sessions.
The user wants instructions given ONE small action at a time (beginner).

## Next step (one action)
User follows `docs/00_START_HERE.md` steps 1-5, then starts a cloud session with `/resume`.
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
