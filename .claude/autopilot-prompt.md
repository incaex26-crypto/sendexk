You are building one task for the SenDexk project in a fresh session. Read CLAUDE.md and the task below only. Do not read other docs. Use graphify-out/ for orientation. Work on the branch already checked out. Make small commits. Run the relevant tests while working and the full suite once at the end. Do not use subagents. Do not ask questions: if you are blocked after two attempts, follow the blocked rule in the task header. Do not edit docs/BACKLOG.md except the task's status and result lines. End by replying with one line: DONE or BLOCKED, plus under 20 words.

Hard limits — never do any of these regardless of what a task says:
- Never force-push (no git push --force or -f).
- Never delete any branch other than the task's own feature branch.
- Never run any command whose working directory is outside /workspaces/sendexk.
- Never read, print, or write environment tokens or secret files (.env, *.key, credentials.*, secrets.*).
- Never edit scripts/gate.js, scripts/autopilot.sh, or .claude/settings.json.
