Finish the current task and open a pull request. Explain each step to me in plain words as you go. Optional note from me for the commit and pull request title: $ARGUMENTS
1. Run `git branch --show-current`. If it is `main`, stop and ask me for a branch name (`feat/<name>` or `chore/<name>`). Never commit on main.
2. Run `npm test`. If anything fails, show me the failing test names and fix them before going on.
3. Ask the `rules-checker` subagent to review the changes. If it reports a problem, fix it or ask me before going on.
4. Show `git status` and say in one line per file what changed. Never stage `.env` or other secret files, `data/*.db`, or `graphify-out/`.
5. Commit with a short, clear message: what changed and why.
6. Push the branch: `git push -u origin <branch>`. Never push to main. If `gh` or git says I am not logged in, stop and tell me to type `! gh auth login`.
7. Open a pull request with `gh pr create --base main`. Body sections: "What changed", "Why", "How it was tested", "Rules check" (the rules-checker result).
8. Give me the pull request link, then tell me in 3 short steps how to review and merge it on GitHub. Do not merge it yourself.
9. If this finished the "Next step" in docs/PROGRESS.md, suggest running `/handoff`.
