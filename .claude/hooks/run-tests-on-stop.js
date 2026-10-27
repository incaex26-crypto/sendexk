// Stop hook: run `npm test` when Claude finishes a turn. If tests fail, send Claude back to fix them.
// The tests guard the money rules (whole cents, balanced ledger, cap) and take about a second.
// Exit code 2 tells Claude Code "do not stop yet" and shows the message to Claude.
const { spawnSync } = require('node:child_process');

function runTests(cwd) {
  const r = spawnSync('npm', ['test'], { cwd, encoding: 'utf8', timeout: 150000 });
  return { ok: r.status === 0, output: `${r.stdout || ''}${r.stderr || ''}${r.error ? r.error.message : ''}` };
}

// stop_hook_active means Claude was already sent back once this turn: let it stop so it can
// report the failure instead of looping forever.
function decide(input, run) {
  if (input.stop_hook_active) return null;
  const { ok, output } = run();
  if (ok) return null;
  const tail = output.trim().split('\n').slice(-40).join('\n');
  return `npm test failed. Fix it before finishing, or tell the user plainly why it cannot be fixed now.\n${tail}`;
}

if (require.main === module) {
  let raw = '';
  process.stdin.on('data', (c) => (raw += c)).on('end', () => {
    const input = JSON.parse(raw || '{}');
    const cwd = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
    const reason = decide(input, () => runTests(cwd));
    if (reason) { process.stderr.write(reason + '\n'); process.exit(2); }
  });
}
module.exports = { decide };
