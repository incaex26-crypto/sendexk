// Decides, without using any AI, whether a finished task branch may be merged automatically.
// Usage: node scripts/gate.js <risk: low|high> [base=main]
// Exit 0 = safe to merge. Exit 2 = tests failed. Exit 3 = needs the owner's approval.
const { spawnSync } = require('node:child_process');

const SENSITIVE = [
  /(^|\/)[^/]*(ledger|payment|wallet|auth|login|otp|admin|session|secret|crypto|password|token|webhook|refund|payout)[^/]*$/i,
  /^\.claude\//, /^\.github\//, /^config\//, /^package(-lock)?\.json$/, /^scripts\/(gate|autopilot)/,
  /^CLAUDE\.md$/, /^AGENTS\.md$/, /^\.env/,
];
const MAX_FILES = 25;

function decide({ risk, files, testsPassed }) {
  if (!testsPassed) return { code: 2, reason: 'tests failed' };
  if (risk !== 'low') return { code: 3, reason: 'task is marked high risk' };
  const hit = files.find((f) => SENSITIVE.some((re) => re.test(f)));
  if (hit) return { code: 3, reason: `touches sensitive file: ${hit}` };
  if (files.length > MAX_FILES) return { code: 3, reason: `${files.length} files changed (limit ${MAX_FILES})` };
  return { code: 0, reason: 'low risk, tests pass, no sensitive files' };
}

module.exports = { decide, SENSITIVE };

if (require.main === module) {
  const risk = process.argv[2] || 'high';
  const base = process.argv[3] || 'main';
  const diff = spawnSync('git', ['diff', '--name-only', `${base}...HEAD`], { encoding: 'utf8' });
  const files = diff.stdout.split('\n').filter(Boolean);
  const tests = spawnSync('npm', ['test', '--silent'], { stdio: 'ignore' });
  const r = decide({ risk, files, testsPassed: tests.status === 0 });
  console.log(`gate: ${r.reason}`);
  process.exit(r.code);
}
