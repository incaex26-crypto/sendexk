#!/usr/bin/env bash
# Runs up to N backlog tasks, each in a FRESH Claude session (small context = fewer credits).
# Checks and merging are done by scripts, not by the model.
# Usage: bash scripts/autopilot.sh [N=3]
set -u
N="${1:-3}"
MODEL="${AUTOPILOT_MODEL:-sonnet}"
# --max-turns does not exist in this build; use --max-budget-usd to cap spend per task.
MAX_BUDGET="${AUTOPILOT_MAX_BUDGET_USD:-0.50}"
# Verified against `claude --help`: --model, --max-budget-usd, --permission-mode all exist.
CLAUDE_FLAGS=(--model "$MODEL" --max-budget-usd "$MAX_BUDGET" --permission-mode acceptEdits)

merged=(); waiting=(); blocked=(); failed=()
git checkout main -q && git pull -q || { echo "Cannot update main. Stopping."; exit 1; }

for ((i=1; i<=N; i++)); do
  out="$(node scripts/next-task.js)" || { echo "Backlog empty."; break; }
  meta="$(echo "$out" | head -1)"; body="$(echo "$out" | tail -n +2)"
  id="$(node -e "console.log(JSON.parse(process.argv[1]).id)" "$meta")"
  risk="$(node -e "console.log(JSON.parse(process.argv[1]).risk)" "$meta")"
  branch="feat/$(echo "$id" | tr 'A-Z' 'a-z')"
  echo "== $id ($risk) =="
  git checkout -q -B "$branch" main

  claude -p "$(cat .claude/autopilot-prompt.md)

TASK:
$body" "${CLAUDE_FLAGS[@]}" > ".autopilot-$id.log" 2>&1

  status="$(sed -n '/^## '"$id"' /,/^## T/p' docs/BACKLOG.md | grep -m1 '^status:' | awk '{print $2}')"
  if [ "$status" = "blocked" ]; then
    git add -A && git commit -qm "autopilot: $id blocked" && git checkout -q main
    blocked+=("$id"); continue
  fi
  if [ "$status" != "done" ]; then failed+=("$id"); git checkout -q main; continue; fi

  git add -A && git commit -qm "feat: $id (autopilot)" 2>/dev/null
  node scripts/gate.js "$risk" main; code=$?
  git push -q -u origin "$branch"
  title="$(echo "$body" | head -1 | sed 's/^## //')"
  pr="$(gh pr create --base main --head "$branch" --title "$title" --body "Automated by autopilot. Gate result code: $code." 2>/dev/null | tail -1)"
  if [ $code -eq 0 ]; then
    gh pr merge "$pr" --merge --delete-branch -q && merged+=("$id") || waiting+=("$id $pr")
    git checkout -q main && git pull -q
  else
    waiting+=("$id $pr (gate code $code)")
    git checkout -q main
  fi
done

echo; echo "SUMMARY"
echo "Merged: ${merged[*]:-none}"
echo "Waiting for your approval: ${waiting[*]:-none}"
echo "Blocked (see docs/BLOCKED.md): ${blocked[*]:-none}"
echo "Failed to finish: ${failed[*]:-none} (logs in .autopilot-*.log)"
