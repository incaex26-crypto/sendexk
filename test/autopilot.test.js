const test = require('node:test');
const assert = require('node:assert');
const { nextTask, parseBacklog } = require('../scripts/next-task.js');
const { decide } = require('../scripts/gate.js');

const sample = `# Backlog\n\n## T1 · first\nrisk: high\nstatus: done\n\n## T2 · second\nrisk: low\nstatus: todo\nbody\n\n## T3 · third\nrisk: low\nstatus: todo\n`;

test('picks first todo task, skips done', () => {
  assert.equal(nextTask(sample).id, 'T2');
});
test('returns null when nothing is todo', () => {
  assert.equal(nextTask('## T1 · a\nrisk: low\nstatus: done\n'), null);
});
test('blocked tasks are skipped', () => {
  assert.equal(nextTask('## T1 · a\nrisk: low\nstatus: blocked\n\n## T2 · b\nrisk: low\nstatus: todo\n').id, 'T2');
});
test('skip list hides attempted tasks (case-insensitive)', () => {
  assert.equal(nextTask(sample, ['t2']).id, 'T3');
  assert.equal(nextTask(sample, ['T2', 'T3']), null);
});
test('missing risk defaults to high', () => {
  assert.equal(parseBacklog('## T1 · a\nstatus: todo\n')[0].risk, 'high');
});
test('gate: failing tests block', () => {
  assert.equal(decide({ risk: 'low', files: ['public/app.css'], testsPassed: false }).code, 2);
});
test('gate: high risk always needs approval', () => {
  assert.equal(decide({ risk: 'high', files: ['public/app.css'], testsPassed: true }).code, 3);
});
test('gate: sensitive files need approval even if low risk', () => {
  for (const f of ['src/ledger.js', 'src/payments.js', 'src/auth.js', 'src/otp.js', 'public/admin.html', '.claude/settings.json', 'package.json', 'config/regions/za-jhb.json']) {
    assert.equal(decide({ risk: 'low', files: [f], testsPassed: true }).code, 3, f);
  }
});
test('gate: ordinary low risk change passes', () => {
  assert.equal(decide({ risk: 'low', files: ['public/app.css', 'public/index.html', 'docs/PROGRESS.md'], testsPassed: true }).code, 0);
});
test('gate: too many files needs approval', () => {
  const files = Array.from({ length: 30 }, (_, i) => `public/p${i}.html`);
  assert.equal(decide({ risk: 'low', files, testsPassed: true }).code, 3);
});
