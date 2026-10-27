const test = require('node:test'), assert = require('node:assert/strict');
const A = require('../src/auth'), S = require('../src/service'), clock = require('../src/clock'), { setup } = require('./helpers');
const MIN = 60_000;

function world() {
  const { db, region } = setup();
  const driverId = S.createDriver(db, region, { name: 'Thabo', vehicle: 'car_ev', phone: '082 123 4567' });
  return { db, region, driverId };
}
const status = (fn) => { try { fn(); } catch (e) { return e.status; } return 200; };

test('phone numbers are normalised with the region country code', () => {
  const { region } = setup();
  for (const p of ['082 123 4567', '+27 82 123 4567', '27821234567', '(082) 123-4567']) assert.equal(A.normalizePhone(region, p), '+27821234567', p);
  for (const p of ['', 'abc', '12', '+1234567890123456']) assert.equal(status(() => A.normalizePhone(region, p)), 400, p);
  const noTrunk = { id: 'x', phone: { countryCode: '39', trunkPrefix: '' } }; // a country whose numbers have no leading 0
  assert.equal(A.normalizePhone(noTrunk, '39 312 345 6789'), '+393123456789');
  assert.equal(A.normalizePhone(noTrunk, '312 345 6789'), '+393123456789');
  assert.equal(status(() => A.normalizePhone({ id: 'draft' }, '0821234567')), 500);
});
test('driver logs in with the right code and gets a session', () => {
  const { db, region, driverId } = world();
  const r = A.requestOtp(db, region, '0821234567');
  assert.equal(r.driverId, driverId); assert.match(r.code, /^\d{6}$/);
  const s = A.verifyOtp(db, region, '+27 82 123 4567', r.code);
  assert.equal(s.driverId, driverId); assert.ok(s.expiresAt > clock.now());
  assert.deepEqual(A.sessionDriver(db, s.token), { driverId, regionId: region.id });
});
test('wrong codes fail, and after 5 wrong tries even the right code fails', () => {
  const { db, region } = world();
  const { code } = A.requestOtp(db, region, '0821234567'), wrong = code === '000000' ? '111111' : '000000';
  for (let i = 0; i < 5; i++) assert.equal(status(() => A.verifyOtp(db, region, '0821234567', wrong)), 401);
  assert.equal(status(() => A.verifyOtp(db, region, '0821234567', code)), 401);
});
test('a code expires after 5 minutes and works only once', () => {
  const { db, region } = world();
  const a = A.requestOtp(db, region, '0821234567');
  clock.advance(5 * MIN + 1);
  assert.equal(status(() => A.verifyOtp(db, region, '0821234567', a.code)), 401);
  const b = A.requestOtp(db, region, '0821234567');
  A.verifyOtp(db, region, '0821234567', b.code);
  assert.equal(status(() => A.verifyOtp(db, region, '0821234567', b.code)), 401);
});
test('asking for a new code cancels the old one', () => {
  const { db, region } = world();
  const old = A.requestOtp(db, region, '0821234567'), fresh = A.requestOtp(db, region, '0821234567');
  if (old.code !== fresh.code) assert.equal(status(() => A.verifyOtp(db, region, '0821234567', old.code)), 401);
  assert.ok(A.verifyOtp(db, region, '0821234567', fresh.code).token);
});
test('at most 3 codes per phone in 15 minutes', () => {
  const { db, region } = world();
  for (let i = 0; i < 3; i++) A.requestOtp(db, region, '0821234567');
  assert.equal(status(() => A.requestOtp(db, region, '0821234567')), 429);
  clock.advance(15 * MIN + 1);
  assert.ok(A.requestOtp(db, region, '0821234567').code);
});
test('an unknown phone gets no code and cannot log in', () => {
  const { db, region } = world();
  const r = A.requestOtp(db, region, '0839999999');
  assert.equal(r.driverId, null); assert.equal(r.code, null);
  assert.equal(status(() => A.verifyOtp(db, region, '0839999999', '123456')), 401);
});
test('sessions end on logout and after 30 days', () => {
  const { db, region } = world();
  const login = () => A.verifyOtp(db, region, '0821234567', A.requestOtp(db, region, '0821234567').code).token;
  const a = login(); A.logout(db, a); assert.equal(A.sessionDriver(db, a), null);
  const b = login(); clock.advance(30 * 24 * 60 * MIN + 1); assert.equal(A.sessionDriver(db, b), null);
  assert.equal(A.sessionDriver(db, ''), null); assert.equal(A.sessionDriver(db, 'made-up'), null);
});
test('codes and session tokens are never stored in plain text', () => {
  const { db, region } = world();
  const { code } = A.requestOtp(db, region, '0821234567'), { token } = A.verifyOtp(db, region, '0821234567', code);
  const dump = JSON.stringify([db.prepare('SELECT * FROM otps').all(), db.prepare('SELECT * FROM sessions').all(), db.prepare('SELECT * FROM events').all()]);
  assert.ok(!dump.includes(token)); assert.ok(!dump.includes(`"${code}"`));
});
test('two drivers cannot share a phone number', () => {
  const { db, region } = world();
  assert.equal(status(() => S.createDriver(db, region, { name: 'Copy', vehicle: 'car', phone: '+27821234567' })), 409);
});
