const test = require('node:test'), assert = require('node:assert/strict');
const mainGuard = require('../.claude/hooks/block-main'), secrets = require('../.claude/hooks/protect-secrets'), stop = require('../.claude/hooks/run-tests-on-stop');
const on = (b) => () => b;

test('main guard: blocks commit and push on main, allows them on a branch', () => {
  assert.ok(mainGuard.check('git commit -m "x"', on('main')));
  assert.ok(mainGuard.check('git add . && git push', on('main')));
  assert.equal(mainGuard.check('git commit -m "x"', on('feat/otp')), null);
  assert.equal(mainGuard.check('git push -u origin feat/otp', on('feat/otp')), null);
  assert.equal(mainGuard.check('git status', on('main')), null);
  assert.equal(mainGuard.check('npm test', () => { throw new Error('git should not be asked'); }), null);
});
test('main guard: blocks pushing to main from any branch', () => {
  assert.ok(mainGuard.check('git push origin main', on('feat/otp')));
  assert.ok(mainGuard.check('git push origin HEAD:main', on('feat/otp')));
  assert.equal(mainGuard.check('git push origin main-fix', on('main-fix')), null);
});
test('secret guard: blocks secret files, allows templates and normal code', () => {
  for (const p of ['.env', '/w/app/.env.local', 'keys/server.pem', 'config/secrets.json', 'secrets.yml', 'credentials.yml', 'credentials.json', '/home/u/.ssh/id_ed25519'])
    assert.ok(secrets.isSecretPath(p), p);
  for (const p of ['.env.example', 'src/idempotencyKey.js', 'src/secrets.js', 'config/regions/za-jhb.json', 'README.md'])
    assert.equal(secrets.isSecretPath(p), false, p);
  assert.ok(secrets.check('Read', { file_path: '/w/.env' }));
  assert.ok(secrets.check('Grep', { pattern: 'KEY', path: '.env.production' }));
  assert.ok(secrets.check('Bash', { command: 'cat .env | head' }));
  assert.ok(secrets.check('Bash', { command: 'node --env-file=.env server.js' }));
  assert.equal(secrets.check('Bash', { command: 'cp .env.example .env.sample' }), null);
  assert.equal(secrets.check('Edit', { file_path: 'src/pricing.js' }), null);});
test('stop hook: sends Claude back once when tests fail, never loops', () => {
  assert.equal(stop.decide({}, () => ({ ok: true, output: '' })), null);
  assert.match(stop.decide({}, () => ({ ok: false, output: 'not ok 3 - ledger' })), /npm test failed[\s\S]*ledger/);
  assert.equal(stop.decide({ stop_hook_active: true }, () => { throw new Error('should not run tests'); }), null);
});
