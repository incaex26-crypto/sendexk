// Recipient confirmation tokens: random, only the hash is stored, they expire.
const crypto = require('node:crypto');
const hash = (t) => crypto.createHash('sha256').update(t).digest('hex');
function newToken() { const token = crypto.randomBytes(18).toString('base64url'); return { token, hash: hash(token) }; }
function newCode() { return String(crypto.randomInt(0, 10000)).padStart(4, '0'); }
function safeEqual(a, b) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
module.exports = { hash, newToken, newCode, safeEqual };
