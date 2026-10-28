// Driver phone login: one-time codes (OTP) and sessions.
// Only hashes are stored, so a leaked database reveals no codes and no session tokens.
const crypto = require('node:crypto');
const C = require('./confirm');
const clock = require('./clock');
const { tx } = require('./db');
const { err, log } = require('./service');
const { normalizePhone } = require('./phone');

const MIN = 60_000;
const CODE_TTL = 5 * MIN, MAX_TRIES = 5;           // 5 guesses at a 1-in-a-million code
const CODE_WINDOW = 15 * MIN, MAX_CODES = 3;       // caps SMS cost and guessing per phone
const SESSION_TTL = 30 * 24 * 60 * MIN;            // drivers stay logged in on their own phone

const codeHash = (salt, code) => C.hash(`${salt}:${code}`);

/** Make a code for this phone. Returns the code so the caller can send it; null code for unknown phones. */
function requestOtp(db, region, rawPhone) {
  const phone = normalizePhone(region, rawPhone), now = clock.now();
  return tx(db, () => {
    const recent = db.prepare('SELECT COUNT(*) n FROM otps WHERE region_id=? AND phone=? AND created_at>?').get(region.id, phone, now - CODE_WINDOW).n;
    if (recent >= MAX_CODES) throw err(429, 'too many codes asked for; try again in 15 minutes');
    const driver = db.prepare('SELECT id FROM drivers WHERE region_id=? AND phone=?').get(region.id, phone);
    // Unknown phones still get a row, so the limit and the reply look the same as for drivers.
    const code = driver ? String(crypto.randomInt(0, 1_000_000)).padStart(6, '0') : null;
    const salt = crypto.randomBytes(8).toString('hex');
    db.prepare('UPDATE otps SET used_at=? WHERE region_id=? AND phone=? AND used_at IS NULL').run(now, region.id, phone);
    db.prepare('INSERT INTO otps (region_id,phone,driver_id,salt,code_hash,created_at,expires_at) VALUES (?,?,?,?,?,?,?)')
      .run(region.id, phone, driver ? driver.id : null, salt, code ? codeHash(salt, code) : null, now, now + CODE_TTL);
    if (driver) log(db, region.id, 'driver', driver.id, 'otp_requested', 'driver:' + driver.id);
    return { phone, driverId: driver ? driver.id : null, code };
  });
}

/** Check a code. On success the code is used up and a new session token is returned. */
function verifyOtp(db, region, rawPhone, rawCode) {
  const phone = normalizePhone(region, rawPhone), code = String(rawCode || '').trim(), now = clock.now();
  if (!/^\d{6}$/.test(code)) throw err(400, 'enter the 6-digit code');
  // Failures are returned, not thrown, inside tx so the wrong-try count is saved instead of rolled back.
  const r = tx(db, () => {
    const o = db.prepare('SELECT * FROM otps WHERE region_id=? AND phone=? AND used_at IS NULL ORDER BY id DESC LIMIT 1').get(region.id, phone);
    if (!o || o.expires_at <= now) return { fail: 'code expired or not found; ask for a new one' };
    if (o.attempts >= MAX_TRIES) return { fail: 'too many wrong tries; ask for a new code' };
    if (!o.driver_id || !C.safeEqual(codeHash(o.salt, code), o.code_hash)) {
      db.prepare('UPDATE otps SET attempts=attempts+1 WHERE id=?').run(o.id);
      if (o.driver_id) log(db, region.id, 'driver', o.driver_id, 'login_failed', 'driver:' + o.driver_id);
      return { fail: 'wrong code' };
    }
    db.prepare('UPDATE otps SET used_at=? WHERE id=?').run(now, o.id);
    const { token, hash } = C.newToken();
    db.prepare('INSERT INTO sessions (token_hash,driver_id,region_id,created_at,expires_at) VALUES (?,?,?,?,?)').run(hash, o.driver_id, region.id, now, now + SESSION_TTL);
    log(db, region.id, 'driver', o.driver_id, 'login', 'driver:' + o.driver_id);
    return { token, driverId: o.driver_id, expiresAt: now + SESSION_TTL };
  });
  if (r.fail) throw err(401, r.fail);
  return r;
}

/** Who owns this session token, or null if it is unknown, expired or logged out. */
function sessionDriver(db, token) {
  if (!token) return null;
  const s = db.prepare('SELECT driver_id, region_id, expires_at, revoked_at FROM sessions WHERE token_hash=?').get(C.hash(token));
  if (!s || s.revoked_at || s.expires_at <= clock.now()) return null;
  return { driverId: s.driver_id, regionId: s.region_id };
}

function logout(db, token) {
  if (token) db.prepare('UPDATE sessions SET revoked_at=? WHERE token_hash=? AND revoked_at IS NULL').run(clock.now(), C.hash(token));
}

module.exports = { normalizePhone, requestOtp, verifyOtp, sessionDriver, logout };
