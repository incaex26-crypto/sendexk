# Agent workflow: building for longer, and what to do when Claude runs out

## Normal loop
`/resume` > one small task on its own branch > `npm test` > commit > pull request > user merges > `/handoff`.
Claude Code in the cloud keeps running if you close the tab and counts toward your plan's usage like everything else. Several tasks can run side by side, each on its own branch.

## Why the md files exist
Any agent starts blank. These files are its memory: `CLAUDE.md` (rules), `docs/PROGRESS.md` (state and next step), `docs/03_DECISIONS.md` (choices), `docs/04_ROADMAP.md` (plan). **If PROGRESS.md is stale, the next agent will do the wrong thing.** Update it before stopping.

## If Claude hits its usage limit (pause code, hand off)
1. Stop starting new work. If a session is still alive, run `/handoff` (it works even with a small budget).
2. Make sure everything is committed on a branch and tests pass. If tests fail, write the failing test name at the top of PROGRESS.md.
3. Either wait for the limit to reset, or give the repository to another coding agent. Many coding tools read `AGENTS.md`; check that your tool does, or paste: "Read AGENTS.md, CLAUDE.md and docs/PROGRESS.md, then continue."
4. The other agent works on a branch too, never on `main`. Tests decide whether its work is acceptable.
5. When Claude is back, `/resume` picks up from the updated PROGRESS.md.

## Keeping other agents safe
- Use a branch per agent and merge only green pull requests.
- Do not give any agent your passwords, bank keys or production tokens. Test keys only, in environment variables.
- Free third-party AI routers (see `07_PLUGINS_AND_TOOLS.md`) send your code to outside providers. Keep secrets and real customer data out of any session that uses them.

## Spending usage wisely
- Plan mode first for big tasks; small precise tasks; paste exact errors.
- Let tests catch mistakes instead of long reviews.
- Prefer one clear instruction over many back-and-forth messages.
