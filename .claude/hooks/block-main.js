// PreToolUse hook (Bash): refuse `git commit` / `git push` on main, and any push that targets main.
// CLAUDE.md says never commit or push to main; this turns that written rule into a lock.
// Exit code 2 tells Claude Code to block the command and show the message to Claude.
const { execFileSync } = require('node:child_process');

const GIT_WRITE = /\bgit\b[^;&|]*\b(commit|push)\b/;
const PUSH_TO_MAIN = /\bgit\b[^;&|]*\bpush\b[^;&|]*[\s:]main(\s|$)/;

// getBranch is a function so git is only asked when the command is a commit or push.
function check(command, getBranch) {
  if (!GIT_WRITE.test(command)) return null;
  if (getBranch() === 'main') return 'Blocked: you are on main. Create a branch first in its own step (git checkout -b feat/<name>), then commit there.';
  if (PUSH_TO_MAIN.test(command)) return 'Blocked: pushing to main is not allowed. Push your own branch and open a pull request.';
  return null;
}

function currentBranch(cwd) {
  try { return execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd, encoding: 'utf8' }).trim(); } catch { return ''; }
}

if (require.main === module) {
  let raw = '';
  process.stdin.on('data', (c) => (raw += c)).on('end', () => {
    const input = JSON.parse(raw || '{}');
    const reason = check(input.tool_input?.command || '', () => currentBranch(input.cwd || process.cwd()));
    if (reason) { process.stderr.write(reason + '\n'); process.exit(2); }
  });
}
module.exports = { check };
