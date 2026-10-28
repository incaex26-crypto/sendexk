#!/usr/bin/env bash
# Runs up to N backlog tasks, each in a FRESH Claude session (small context = fewer credits).
# Checks and merging are done by scripts, not by the model.
# Tasks that already have a branch on GitHub (waiting for approval or blocked) are skipped,
# so the same task is never built twice. To retry a task, delete its remote branch.
# When a task is left waiting for approval, the next task is built on top of it (stacked PRs).
# Usage: bash scripts/autopilot.sh [N=3]
set -u
N="${1:-3}"
MODEL="${AUTOPILOT_MODEL:-sonnet}"
MAX_TURNS="${AUTOPILOT_MAX_TURNS:-40}"
# Verify these flags with "claude --help" if a run fails to start.
CLAUDE_FLAGS=(--model "$MODEL" --max-turns "$MAX_TURNS" --dangerously-skip-permissions)

merged=(); waiting=(); blocked=(); failed=()
git checkout main -q && git pull -q || { echo "Cannot update main. Stopping."; exit 1; }

# Tasks already in flight: any feat/tN branch on the remote.
skip="$(git ls-remote --heads origin 'feat/t*' 2>/dev/null | sed 's#.*refs/heads/feat/##' | tr 'a-z' 'A-Z' | paste -sd, -)"
BASE=main

for ((i=1; i<=N; i++)); do
  out="$(SKIP="$skip" node scripts/next-task.js)" || { echo "Nothing left to do (all tasks done, blocked or waiting)."; break; }
  meta="$(echo "$out" | head -1)"; body="$(echo "$out" | tail -n +2)"
  id="$(node -e "console.log(JSON.parse(process.argv[1]).id)" "$meta")"
  risk="$(node -e "console.log(JSON.parse(process.argv[1]).risk)" "$meta")"
  branch="feat/$(echo "$id" | tr 'A-Z' 'a-z')"
  skip="$skip,$id"
  echo "== $id ($risk) on top of $BASE =="
  git checkout -q -B "$branch" "$BASE"

  claude -p "$(cat .claude/autopilot-prompt.md)

TASK:
$body" "${CLAUDE_FLAGS[@]}" > ".autopilot-$id.log" 2>&1

  status="$(sed -n '/^## '"$id"' /,/^## T/p' docs/BACKLOG.md | grep -m1 '^status:' | awk '{print $2}')"
  git add -A && git commit -qm "autopilot: $id ($status)" 2>/dev/null

  if [ "$status" = "blocked" ]; then
    git push -q -u origin "$branch"; blocked+=("$id"); git checkout -q main; continue
  fi
  if [ "$status" != "done" ]; then failed+=("$id"); git checkout -q main; continue; fi

  node scripts/gate.js "$risk" "$BASE"; code=$?
  git push -q -u origin "$branch"
  title="$(echo "$body" | head -1 | sed 's/^## //')"
  pr="$(gh pr create --base "$BASE" --head "$branch" --title "$title" --body "Automated by autopilot. Gate result code: $code. Base: $BASE." 2>/dev/null | tail -1)"
  if [ $code -eq 0 ] && [ "$BASE" = "main" ]; then
    if gh pr merge "$pr" --merge --delete-branch -q; then merged+=("$id"); git checkout -q main && git pull -q
    else waiting+=("$id $pr"); BASE="$branch"; fi
  else
    waiting+=("$id $pr (gate code $code)")
    BASE="$branch"
  fi
done

git checkout -q main
echo; echo "SUMMARY"
echo "Merged: ${merged[*]:-none}"
echo "Waiting for your approval (merge in the order listed): ${waiting[*]:-none}"
echo "Blocked (see docs/BLOCKED.md): ${blocked[*]:-none}"
echo "Failed to finish: ${failed[*]:-none} (logs in .autopilot-*.log)"
