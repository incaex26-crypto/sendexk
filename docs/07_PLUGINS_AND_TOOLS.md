# Plugins and tools from the video

Source: a short vertical video (TikTok, "sebintel") listing Claude Code tips. I read the on-screen text; I could not use its audio, so details below are what was visible plus what I verified in Anthropic's docs. Re-check anything before relying on it.

| # | Shown in the video | What it is | Our use |
|---|---|---|---|
| 1 | Claude in Slack: a bug report in a channel starts a Claude Code session ("Working in payment-service", "View Claude Code session") | Claude Code running in the cloud on a repo, started from chat | Later, if we use Slack. Today use claude.ai/code. |
| 2 | A "Smart Router" dashboard: one endpoint over many free-tier AI providers (claimed about 1.5B free tokens a month, many providers and models, works with tools like Cursor and Cline) | A third-party proxy that spreads requests over free AI plans | **This is the answer to "use other agents when Claude runs out."** Optional, later, with the cautions below. |
| 3 | "Build your whole team with Claude": 42 Claude skills arranged like a company (departments) | A set of skills (instruction packs) | Optional. Our `.claude/commands/` are the small version. |
| 4 | **Claude Code Setup plugin** (`claude-code-setup`, skill `claude-automation-recommender`) | Official plugin that reads your codebase and recommends hooks, skills, MCP servers, subagents and slash commands. Read-only. | **Install first.** |
| 5 | **Claude Security** | Scans GitHub repos for vulnerabilities and offers "Suggest fix" | Use before the pilot. Availability depends on your plan: check inside Claude. |

## Install item 4 (on your own computer, not in cloud sessions)
Plugins are installed in Claude Code on your machine (terminal, desktop app or VS Code). Cloud sessions do not load plugins you installed locally, so skills you want in the cloud should live **in the repository** (`.claude/commands/`, which we already have).
In Claude Code:
```
/plugin install claude-code-setup@claude-plugins-official
```
Choose "Install for all collaborators on this repository (project scope)" if you want it recorded in the repo. Then ask: "recommend automations for this project". Review each suggestion before accepting. Other official plugins worth reading about: `commit-commands` (commit and pull request helpers). Check cost with `claude plugin details <name>`; every plugin adds to what each session loads.

## "Code and test for longer"
- Tests in `npm test` are the long-run safety net. Keep adding to them.
- GitHub **Auto-fix** (comes with the Claude GitHub App) lets Claude respond to failing checks on pull requests.
- Scheduled tasks can run the simulator daily and report; add in Phase 4.
- Hooks (auto-run tests after edits) are a good first recommendation to ask the setup plugin about.

## Item 2 cautions (free router)
- I could not identify the exact project from the video. Find its official page and read the licence and privacy terms first.
- Free tiers change quickly; claims like "1.5B tokens" are marketing until you measure them.
- Your prompts and code go to several outside companies. No secrets, no customer data.
- Output quality varies by model. Treat the other agent's work as untrusted until tests pass.

## Plugins the user asked for (checked 2026-10-27)
| Tool | Install | Notes |
|---|---|---|
| Agent Skills | `/plugin marketplace add anthropics/skills` then `/plugin install example-skills@anthropic-agent-skills` | Check licences before using document skills. |
| Graphify | `uv tool install graphifyy` (two y's) then `graphify install`, then `/graphify .` | Writes `graphify-out/` and a git hook. Code parsed locally. Benefit small on a small repo. Needs Python and uv. |
| Ponytail | `/plugin marketplace add DietrichGebert/ponytail` then `/plugin install ponytail@ponytail` | Source unverified (README page is under another account). Runs Node hooks. Try on a branch only. Claims are its own benchmarks. |
| OmniRoute | `npm install -g omniroute` then `omniroute` (port 20128) | Set `INITIAL_PASSWORD` first (default is CHANGEME). Holds all provider keys. Needs Node 22.22.2+ or 24+. Code goes to outside providers. Use only as a fallback profile, not global. Runs on the user's machine or Codespace, not claude.ai/code cloud sessions. |
