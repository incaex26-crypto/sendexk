// Admin accounts, sessions, OTP codes, business sessions and store API keys.
// All state is in SQLite so limits survive restarts.
const crypto = require('node:crypto');
const clock = require('./clock');
const N = require('./notify');

const MIN = 60_000, HOUR = 60 * MIN;
const SESSION_TTL = 8 * HOUR, OTP_TTL = 10 * MIN, MAX_CODE_TRIES = 5;
const BIZ_COOKIE = 'biz_session';

const err = (status, message) => Object.assign(new Error(message), { status });
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const tooMany = (ms) => err(429, `Too many attempts. Try again in ${Math.max(1, Math.ceil(ms / MIN))} minutes.`);

function initAuth(db) {
  N.initNotify(db); // OTP codes are sent through notify, so its tables must exist too
  db.exec(`
CREATE TABLE IF NOT EXISTS admin_users (id INTEGER PRIMARY KEY, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, created_at INTEGER);
CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, kind TEXT NOT NULL, subject INTEGER NOT NULL, created_at INTEGER, expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS otp_codes (id INTEGER PRIMARY KEY, phone TEXT NOT NULL, code_hash TEXT NOT NULL, attempts INTEGER DEFAULT 0, created_at INTEGER, expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS rate_limits (id INTEGER PRIMARY KEY, bucket TEXT NOT NULL, key TEXT NOT NULL, at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS locks (bucket TEXT, key TEXT, until INTEGER, PRIMARY KEY(bucket, key));`);

  // Migrate sessions table created by the old driver-OTP code (pre-PR #9).
  // Old schema: (token_hash, driver_id, region_id, created_at, expires_at, revoked_at)
  // New schema: (token_hash, kind, subject, created_at, expires_at)
  // Symptom: CREATE INDEX on (kind, subject) fails with "no such column: kind".
  const cols = db.prepare('PRAGMA table_info(sessions)').all().map(r => r.name);
  if (!cols.includes('kind')) {
    db.exec(`
ALTER TABLE sessions RENAME TO sessions_v1;
CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, kind TEXT NOT NULL, subject INTEGER NOT NULL, created_at INTEGER, expires_at INTEGER NOT NULL);
INSERT INTO sessions (token_hash, kind, subject, created_at, expires_at)
  SELECT token_hash, 'driver', driver_id, created_at, expires_at
  FROM sessions_v1
  WHERE driver_id IS NOT NULL AND revoked_at IS NULL AND expires_at > 0;
DROP TABLE sessions_v1;`);
  }

  db.exec(`
CREATE INDEX IF NOT EXISTS ix_sessions_subject ON sessions(kind, subject);
CREATE INDEX IF NOT EXISTS ix_rate ON rate_limits(bucket, key, at);
CREATE TABLE IF NOT EXISTS api_keys (id INTEGER PRIMARY KEY, account_id INTEGER NOT NULL, key_hash TEXT NOT NULL UNIQUE, name TEXT, created_at INTEGER, revoked_at INTEGER);
CREATE INDEX IF NOT EXISTS ix_api_keys_hash ON api_keys(key_hash);`);
}

// ---- passwords: scrypt + random 16-byte salt, compared in constant time ----
function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  return `scrypt$${salt.toString('hex')}$${crypto.scryptSync(String(pw), salt, 64).toString('hex')}`;
}
function checkPassword(pw, stored) {
  const [, saltHex, hashHex] = String(stored).split('$');
  const want = Buffer.from(hashHex || '', 'hex');
  const got = crypto.scryptSync(String(pw), Buffer.from(saltHex || '', 'hex'), 64);
  return want.length === got.length && crypto.timingSafeEqual(want, got);
}
const DUMMY = hashPassword('dummy'); // so unknown emails cost the same time as known ones

function createAdmin(db, email, password) {
  if (!email || !password || password.length < 10) throw err(400, 'email and a password of 10+ characters required');
  db.prepare('INSERT INTO admin_users (email, password_hash, created_at) VALUES (?,?,?)').run(email.toLowerCase(), hashPassword(password), clock.now());
}

// ---- sessions: random token, only its hash is stored ----
function newSession(db, kind, subject) {
  const token = crypto.randomBytes(32).toString('hex'), now = clock.now();
  db.prepare('INSERT INTO sessions (token_hash, kind, subject, created_at, expires_at) VALUES (?,?,?,?,?)').run(sha(token), kind, subject, now, now + SESSION_TTL);
  return token;
}
function sessionSubject(db, kind, token) {
  if (!token) return null;
  const s = db.prepare('SELECT subject, expires_at FROM sessions WHERE token_hash=? AND kind=?').get(sha(token), kind);
  return s && s.expires_at > clock.now() ? s.subject : null;
}
const endSession = (db, token) => db.prepare('DELETE FROM sessions WHERE token_hash=?').run(sha(token));

// ---- rate limit helpers ----
const hit = (db, bucket, key) => db.prepare('INSERT INTO rate_limits (bucket, key, at) VALUES (?,?,?)').run(bucket, key, clock.now());
function windowCount(db, bucket, key, span) {
  const rows = db.prepare('SELECT at FROM rate_limits WHERE bucket=? AND key=? AND at>? ORDER BY at').all(bucket, key, clock.now() - span);
  return { n: rows.length, oldest: rows[0] && rows[0].at };
}

// ---- admin login: 5 failures per email per 15 min, then locked 15 min ----
function adminLogin(db, email, password) {
  const key = String(email || '').toLowerCase(), now = clock.now();
  const lock = db.prepare("SELECT until FROM locks WHERE bucket='admin' AND key=?").get(key);
  if (lock && lock.until > now) throw tooMany(lock.until - now);
  const u = db.prepare('SELECT * FROM admin_users WHERE email=?').get(key);
  const ok = checkPassword(password, u ? u.password_hash : DUMMY) && !!u;
  if (!ok) {
    hit(db, 'admin_fail', key);
    if (windowCount(db, 'admin_fail', key, 15 * MIN).n >= 5) {
      db.prepare("INSERT OR REPLACE INTO locks (bucket, key, until) VALUES ('admin', ?, ?)").run(key, now + 15 * MIN);
      db.prepare("DELETE FROM rate_limits WHERE bucket='admin_fail' AND key=?").run(key);
      throw tooMany(15 * MIN);
    }
    throw err(401, 'Wrong email or password.');
  }
  db.prepare("DELETE FROM rate_limits WHERE bucket='admin_fail' AND key=?").run(key);
  return newSession(db, 'admin', u.id);
}

// ---- driver OTP ----
const suspendedErr = () => err(403, 'Your account is suspended. Contact support.');

function requestOtp(db, phone, device) {
  if (!phone) throw err(400, 'phone required');
  const dev = String(device || 'unknown');
  const p = windowCount(db, 'otp_phone', phone, 15 * MIN);
  if (p.n >= 3) throw tooMany(p.oldest + 15 * MIN - clock.now());
  const d = windowCount(db, 'otp_device', dev, HOUR);
  if (d.n >= 10) throw tooMany(d.oldest + HOUR - clock.now());
  hit(db, 'otp_phone', phone); hit(db, 'otp_device', dev);
  const driver = db.prepare('SELECT id, status FROM drivers WHERE phone=?').get(phone);
  if (driver && driver.status === 'suspended') throw suspendedErr();
  // Same answer whether or not the phone is known, so numbers cannot be probed.
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  if (driver) {
    db.prepare('DELETE FROM otp_codes WHERE phone=?').run(phone);
    db.prepare('INSERT INTO otp_codes (phone, code_hash, created_at, expires_at) VALUES (?,?,?,?)').run(phone, sha(phone + ':' + code), clock.now(), clock.now() + OTP_TTL);
    N.notify(db, { to: { role: 'driver', id: driver.id, phone }, kind: 'otp_code', data: { code } });
  }
  // Same reply either way; the code is shown only for fake channels on an npm run dev server.
  return { sent: true, devCode: N.devCodesVisible() ? code : undefined };
}

function verifyOtp(db, phone, code) {
  const row = db.prepare('SELECT * FROM otp_codes WHERE phone=? ORDER BY id DESC LIMIT 1').get(phone);
  if (!row || row.expires_at <= clock.now()) throw err(401, 'Code expired or not requested.');
  if (sha(phone + ':' + code) !== row.code_hash) {
    if (row.attempts + 1 >= MAX_CODE_TRIES) { db.prepare('DELETE FROM otp_codes WHERE id=?').run(row.id); throw err(401, 'Code is no longer valid. Request a new one.'); }
    db.prepare('UPDATE otp_codes SET attempts=attempts+1 WHERE id=?').run(row.id);
    throw err(401, 'Wrong code.');
  }
  db.prepare('DELETE FROM otp_codes WHERE id=?').run(row.id);
  const driver = db.prepare('SELECT id, status FROM drivers WHERE phone=?').get(phone);
  if (!driver) throw err(401, 'Wrong code.');
  if (driver.status === 'suspended') throw suspendedErr();
  return { driverId: driver.id, token: newSession(db, 'driver', driver.id) };
}

/** Suspend: flag the driver and kill every session at once. */
function suspendDriver(db, driverId) {
  db.prepare("UPDATE drivers SET status='suspended' WHERE id=?").run(driverId);
  db.prepare("DELETE FROM sessions WHERE kind='driver' AND subject=?").run(driverId);
}

/** Resolve a driver request (session token or legacy x-driver-id header); refuses suspended drivers. */
function driverFromRequest(db, token, headerId) {
  const id = token ? sessionSubject(db, 'driver', token) : Number(headerId);
  if (!id) return null;
  const d = db.prepare('SELECT status FROM drivers WHERE id=?').get(id);
  if (d && d.status === 'suspended') throw suspendedErr();
  return id;
}

// ---- business (account) OTP ----
function requestBusinessOtp(db, phone, device) {
  if (!phone) throw err(400, 'phone required');
  const dev = String(device || 'unknown');
  const p = windowCount(db, 'otp_phone', phone, 15 * MIN);
  if (p.n >= 5) throw tooMany(p.oldest + 15 * MIN - clock.now());
  const d = windowCount(db, 'otp_device', dev, HOUR);
  if (d.n >= 20) throw tooMany(d.oldest + HOUR - clock.now());
  hit(db, 'otp_phone', phone); hit(db, 'otp_device', dev);
  const account = db.prepare('SELECT id FROM accounts WHERE phone=?').get(phone);
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  if (account) {
    db.prepare('DELETE FROM otp_codes WHERE phone=?').run(phone);
    db.prepare('INSERT INTO otp_codes (phone, code_hash, created_at, expires_at) VALUES (?,?,?,?)').run(phone, sha(phone + ':' + code), clock.now(), clock.now() + OTP_TTL);
    N.notify(db, { to: { role: 'business', id: account.id, phone }, kind: 'otp_code', data: { code } });
  }
  return { sent: true, devCode: N.devCodesVisible() ? code : undefined };
}

function verifyBusinessOtp(db, phone, code) {
  const row = db.prepare('SELECT * FROM otp_codes WHERE phone=? ORDER BY id DESC LIMIT 1').get(phone);
  if (!row || row.expires_at <= clock.now()) throw err(401, 'Code expired or not requested.');
  if (sha(phone + ':' + code) !== row.code_hash) {
    if (row.attempts + 1 >= MAX_CODE_TRIES) { db.prepare('DELETE FROM otp_codes WHERE id=?').run(row.id); throw err(401, 'Code is no longer valid. Request a new one.'); }
    db.prepare('UPDATE otp_codes SET attempts=attempts+1 WHERE id=?').run(row.id);
    throw err(401, 'Wrong code.');
  }
  db.prepare('DELETE FROM otp_codes WHERE id=?').run(row.id);
  const account = db.prepare('SELECT id FROM accounts WHERE phone=?').get(phone);
  if (!account) throw err(401, 'Wrong code.');
  return { accountId: account.id, token: newSession(db, 'business', account.id) };
}

// ---- store API keys (raw key shown once; only hash is stored) ----
function createStoreKey(db, accountId, name) {
  const raw = crypto.randomBytes(32).toString('hex');
  db.prepare('INSERT INTO api_keys (account_id, key_hash, name, created_at) VALUES (?,?,?,?)').run(accountId, sha(raw), name || 'default', clock.now());
  const id = db.prepare('SELECT last_insert_rowid() AS id').get().id;
  return { id, key: raw }; // raw key shown once, never stored
}

function keyToAccount(db, rawKey) {
  if (!rawKey) return null;
  const row = db.prepare('SELECT account_id, revoked_at FROM api_keys WHERE key_hash=?').get(sha(rawKey));
  if (!row || row.revoked_at) return null;
  return row.account_id;
}

function revokeKey(db, keyId, accountId) {
  const row = db.prepare('SELECT * FROM api_keys WHERE id=? AND account_id=?').get(keyId, accountId);
  if (!row) throw err(404, 'Key not found.');
  if (row.revoked_at) throw err(409, 'Key already revoked.');
  db.prepare('UPDATE api_keys SET revoked_at=? WHERE id=?').run(clock.now(), keyId);
}

/** Resolve a business request: session cookie, then API key header. */
function businessFromRequest(db, cookieHeader, apiKey) {
  const token = parseCookie(cookieHeader, BIZ_COOKIE);
  if (token) {
    const id = sessionSubject(db, 'business', token);
    if (id) return id;
  }
  return keyToAccount(db, apiKey);
}
function parseCookie(header, name) {
  const m = new RegExp(`(?:^|;\\s*)${name}=([0-9a-f]+)`).exec(header || '');
  return m && m[1];
}

function cleanup(db) {
  const now = clock.now(), old = now - 24 * HOUR;
  db.prepare('DELETE FROM otp_codes WHERE expires_at<?').run(now);
  db.prepare('DELETE FROM sessions WHERE expires_at<?').run(now);
  db.prepare('DELETE FROM rate_limits WHERE at<?').run(old);
  db.prepare('DELETE FROM locks WHERE until<?').run(now);
}

module.exports = { initAuth, createAdmin, adminLogin, sessionSubject, endSession, requestOtp, verifyOtp, suspendDriver, driverFromRequest, requestBusinessOtp, verifyBusinessOtp, createStoreKey, keyToAccount, revokeKey, businessFromRequest, BIZ_COOKIE, cleanup };
