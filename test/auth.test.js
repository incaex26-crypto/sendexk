const test = require('node:test'), assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { createApp } = require('../server'), { setup } = require('./helpers');
const A = require('../src/auth'), clock = require('../src/clock');

// Old schema from pre-PR#9 (commit fb12819): sessions had driver_id/region_id/revoked_at, no kind/subject.
// otps table existed instead of otp_codes.
const OLD_SCHEMA = `
PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS drivers (id INTEGER PRIMARY KEY, region_id TEXT, name TEXT, phone TEXT, vehicle TEXT, tier TEXT DEFAULT 'standard', pro_until INTEGER DEFAULT 0, status TEXT DEFAULT 'offline', lat REAL, lng REAL, last_ping INTEGER, pin_lat REAL, pin_lng REAL, pin_at INTEGER, rating REAL DEFAULT 5, created_at INTEGER);
CREATE TABLE IF NOT EXISTS admin_users (id INTEGER PRIMARY KEY, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, created_at INTEGER);
CREATE TABLE IF NOT EXISTS otps (id INTEGER PRIMARY KEY, region_id TEXT, phone TEXT NOT NULL, driver_id INTEGER, salt TEXT, code_hash TEXT, attempts INTEGER DEFAULT 0, created_at INTEGER, expires_at INTEGER, used_at INTEGER);
CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, driver_id INTEGER NOT NULL, region_id TEXT, created_at INTEGER, expires_at INTEGER, revoked_at INTEGER);
`;

test('initAuth migrates old sessions schema: kind column added, live rows preserved, revoked rows dropped', () => {
  const db = new DatabaseSync(':memory:');
  db.exec(OLD_SCHEMA);
  // Insert a live driver session and a revoked one using old schema
  db.prepare("INSERT INTO sessions VALUES ('hash_live', 42, 'za-jhb', 1000, 9999999999, NULL)").run();
  db.prepare("INSERT INTO sessions VALUES ('hash_revoked', 42, 'za-jhb', 1000, 9999999999, 2000)").run();
  // Run initAuth — this is what fails on an old database without the fix
  A.initAuth(db);
  // New schema columns must exist
  const cols = db.prepare('PRAGMA table_info(sessions)').all().map(r => r.name);
  assert.ok(cols.includes('kind'), 'kind column must exist after migration');
  assert.ok(cols.includes('subject'), 'subject column must exist after migration');
  // Live row migrated; revoked row dropped
  const rows = db.prepare('SELECT * FROM sessions').all();
  assert.equal(rows.length, 1, 'only the live session survives');
  assert.equal(rows[0].token_hash, 'hash_live');
  assert.equal(rows[0].kind, 'driver');
  assert.equal(rows[0].subject, 42);
  // Running initAuth again on the already-migrated db must be a no-op
  assert.doesNotThrow(() => A.initAuth(db));
  // The new auth functions must work on the migrated db
  db.prepare("INSERT INTO drivers VALUES (42,'za-jhb','D','071','car','standard',0,'offline',NULL,NULL,NULL,NULL,NULL,NULL,5,1)").run();
  const code = A.requestOtp(db, '071', 'dev').devCode;
  const { token } = A.verifyOtp(db, '071', code);
  assert.ok(token);
});

async function boot() {
  const { db, region } = setup(); const srv = createApp({ db, regions: { [region.id]: region } });
  await new Promise((r) => srv.listen(0, r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const call = async (m, p, body, headers = {}) => { const r = await fetch(base + p, { method: m, headers: { 'content-type': 'application/json', ...headers }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, body: await r.json().catch(() => null), cookie: r.headers.get('set-cookie') }; };
  return { srv, call, db };
}
const addDriver = (db, phone = '0821110000') => Number(db.prepare("INSERT INTO drivers (region_id,name,phone,vehicle,status) VALUES ('za-jhb','D',?,'car','online')").run(phone).lastInsertRowid);
const PW = 'correct horse battery';

test('admin key no longer works; login gives HttpOnly SameSite=Strict cookie', async () => {
  const { srv, call, db } = await boot();
  try {
    A.createAdmin(db, 'a@x.co', PW);
    assert.equal((await call('GET', '/api/admin/overview', null, { 'x-admin-key': 'dev-admin' })).status, 401);
    assert.equal((await call('POST', '/api/admin/login', { email: 'a@x.co', password: 'nope' })).status, 401);
    const l = await call('POST', '/api/admin/login', { email: 'A@x.co', password: PW });
    assert.equal(l.status, 200); assert.match(l.cookie, /HttpOnly/); assert.match(l.cookie, /SameSite=Strict/);
    const cookie = l.cookie.split(';')[0];
    assert.equal((await call('GET', '/api/admin/overview', null, { cookie })).status, 200);
    const stored = db.prepare('SELECT token_hash FROM sessions').get().token_hash;
    assert.ok(!cookie.includes(stored)); // only a hash is stored
    assert.match(db.prepare('SELECT password_hash FROM admin_users').get().password_hash, /^scrypt\$[0-9a-f]{32}\$/);
  } finally { srv.close(); }
});

test('admin session expires after 8 hours', async () => {
  const { srv, call, db } = await boot();
  try {
    A.createAdmin(db, 'a@x.co', PW);
    const cookie = (await call('POST', '/api/admin/login', { email: 'a@x.co', password: PW })).cookie.split(';')[0];
    clock.advance(8 * 3600_000 - 1000); assert.equal((await call('GET', '/api/admin/overview', null, { cookie })).status, 200);
    clock.advance(2000); assert.equal((await call('GET', '/api/admin/overview', null, { cookie })).status, 401);
  } finally { srv.close(); }
});

test('admin login: 5 failures lock the email for 15 minutes with a clear message', async () => {
  const { srv, call, db } = await boot();
  try {
    A.createAdmin(db, 'a@x.co', PW);
    for (let i = 0; i < 4; i++) assert.equal((await call('POST', '/api/admin/login', { email: 'a@x.co', password: 'bad' })).status, 401);
    const fifth = await call('POST', '/api/admin/login', { email: 'a@x.co', password: 'bad' });
    assert.equal(fifth.status, 429); assert.equal(fifth.body.error, 'Too many attempts. Try again in 15 minutes.');
    assert.equal((await call('POST', '/api/admin/login', { email: 'a@x.co', password: PW })).status, 429); // right password still locked
    clock.advance(10 * 60_000);
    assert.equal((await call('POST', '/api/admin/login', { email: 'a@x.co', password: PW })).body.error, 'Too many attempts. Try again in 5 minutes.');
    clock.advance(5 * 60_000 + 1);
    assert.equal((await call('POST', '/api/admin/login', { email: 'a@x.co', password: PW })).status, 200);
  } finally { srv.close(); }
});

test('OTP: 3 requests per phone per 15 minutes, stored in the database', () => {
  const { db } = setup(); addDriver(db);
  for (let i = 0; i < 3; i++) A.requestOtp(db, '0821110000', 'dev' + i);
  assert.throws(() => A.requestOtp(db, '0821110000', 'devX'), /Too many attempts. Try again in 15 minutes./);
  assert.ok(A.requestOtp(db, '0829999999', 'devX').sent); // other phone fine
  clock.advance(15 * 60_000 + 1); assert.ok(A.requestOtp(db, '0821110000', 'devX').sent);
});

test('OTP: 10 requests per device per hour', () => {
  const { db } = setup();
  for (let i = 0; i < 10; i++) A.requestOtp(db, '08200000' + i, 'same');
  assert.throws(() => A.requestOtp(db, '0829999999', 'same'), /Too many attempts. Try again in 60 minutes./);
  assert.ok(A.requestOtp(db, '0829999999', 'other').sent);
  clock.advance(3600_000 + 1); assert.ok(A.requestOtp(db, '0829999999', 'same').sent);
});

test('OTP: 5 wrong guesses kill the code, even the right one', () => {
  const { db } = setup(); addDriver(db);
  const { devCode } = A.requestOtp(db, '0821110000', 'd');
  const wrong = devCode === '000000' ? '111111' : '000000';
  for (let i = 0; i < 4; i++) assert.throws(() => A.verifyOtp(db, '0821110000', wrong), /Wrong code/);
  assert.throws(() => A.verifyOtp(db, '0821110000', wrong), /no longer valid/);
  assert.throws(() => A.verifyOtp(db, '0821110000', devCode), /expired or not requested/);
});

test('OTP: right code logs in and the code is single use; codes expire', () => {
  const { db } = setup(); const id = addDriver(db);
  const { devCode } = A.requestOtp(db, '0821110000', 'd');
  const r = A.verifyOtp(db, '0821110000', devCode); assert.equal(r.driverId, id);
  assert.equal(A.driverFromRequest(db, r.token, null), id);
  assert.throws(() => A.verifyOtp(db, '0821110000', devCode));
  const c2 = A.requestOtp(db, '0821110000', 'd').devCode; clock.advance(11 * 60_000);
  assert.throws(() => A.verifyOtp(db, '0821110000', c2), /expired/);
});

test('suspending a driver logs out every session and refuses the next request', async () => {
  const { srv, call, db } = await boot();
  try {
    const id = addDriver(db); const tokens = [];
    for (let i = 0; i < 2; i++) { const c = A.requestOtp(db, '0821110000', 'd' + i).devCode; tokens.push(A.verifyOtp(db, '0821110000', c).token); }
    const auth = (t) => ({ authorization: 'Bearer ' + t });
    assert.equal((await call('GET', '/api/driver/me', null, auth(tokens[0]))).status, 200);
    A.suspendDriver(db, id);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM sessions WHERE kind='driver'").get().n, 0);
    assert.equal((await call('GET', '/api/driver/me', null, { 'x-driver-id': String(id) })).body.error, 'Your account is suspended. Contact support.');
    assert.equal((await call('GET', '/api/driver/me', null, auth(tokens[1]))).status, 401);
    assert.throws(() => A.requestOtp(db, '0821110000', 'z'), /suspended/);
  } finally { srv.close(); }
});

test('cleanup removes expired codes and sessions and rate rows older than 24h', () => {
  const { db } = setup(); addDriver(db);
  A.requestOtp(db, '0821110000', 'd'); const tok = A.verifyOtp(db, '0821110000', db.prepare('SELECT 1').get() && (() => { const c = A.requestOtp(db, '0821110000', 'd2').devCode; return c; })()).token;
  clock.advance(23 * 3600_000); A.cleanup(db);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM otp_codes').get().n, 0);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM sessions').get().n, 0);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM rate_limits').get().n, 4); // under 24h: kept
  clock.advance(2 * 3600_000); A.cleanup(db);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM rate_limits').get().n, 0);
  assert.ok(tok);
});
