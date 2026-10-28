# Autopilot setup (one-time, for the agent)

Do these steps, then stop. Keep replies under 40 words.
1. On a new branch chore/autopilot: confirm these files exist: docs/BACKLOG.md, docs/BLOCKED.md, scripts/next-task.js, scripts/gate.js, scripts/autopilot.sh, .claude/autopilot-prompt.md, .claude/commands/autopilot.md, test/autopilot.test.js.
2. Run `claude --help` once. If any flag in CLAUDE_FLAGS in scripts/autopilot.sh does not exist or has a different name, fix the script. The owner chose `--dangerously-skip-permissions` for full headless freedom; GitHub branch protection rules (require PR, no direct push to main) are the safety net. Hard limits are enforced via the prompt in `.claude/autopilot-prompt.md`.
3. Add `.autopilot-*.log` to .gitignore. Add to CLAUDE.md under rules: "One task per fresh session. Default model Sonnet. Read only files named in the task. No subagents unless the owner asks. Never change scripts/gate.js, scripts/autopilot.sh or .claude/ in a normal task."
4. Run `npm test` (the new autopilot tests must pass with the rest).
5. Commit, open a PR, merge it if checks are green, then `git checkout main && git pull`.
