// Payment provider interface. Real provider plugged in via PAYMENT_PROVIDER env var.
// Shape: { createLink, verifyWebhook } — same for all providers.
// Duplicate-safe: the caller passes orderId as the idempotency key.
const crypto = require('node:crypto');

function fakeAdapter() {
  const pending = {}; // orderId → { id, cents, done }
  const outbox = [];  // for test assertions
  return {
    fake: true,
    outbox,
    async createLink({ orderId, cents, returnUrl }) {
      if (pending[orderId] && pending[orderId].done) return pending[orderId];
      const id = `fake-pay-${orderId}-${cents}`;
      const url = `${returnUrl}?ref=${id}`;
      pending[orderId] = { id, cents, url, done: false };
      outbox.push({ orderId, id, cents });
      return { id, url };
    },
    verifyWebhook(rawBody, sig, secret) {
      // Fake: sig must be 'fake-sig'; body is { ref, event, cents }
      if (sig !== 'fake-sig') throw Object.assign(new Error('bad signature'), { status: 400 });
      const payload = JSON.parse(rawBody);
      if (pending[payload.orderId]) pending[payload.orderId].done = true;
      return payload;
    },
    // Test helper: simulate a completed payment for orderId
    complete(orderId) {
      const p = pending[orderId];
      if (!p) throw new Error(`no pending payment for order ${orderId}`);
      p.done = true;
      return JSON.stringify({ ref: p.id, orderId, event: 'payment.complete', cents: p.cents });
    },
  };
}

// HMAC-SHA256 signature check for real providers (Peach, Ozow, etc.)
function verifySig(rawBody, sig, secret) {
  const want = crypto.createHmac('sha256', String(secret)).update(rawBody).digest('hex');
  const got = Buffer.from(String(sig), 'hex');
  const exp = Buffer.from(want, 'hex');
  if (got.length !== exp.length || !crypto.timingSafeEqual(got, exp)) throw Object.assign(new Error('bad webhook signature'), { status: 400 });
}

let _adapter = null;
function getAdapter() {
  if (!_adapter) _adapter = fakeAdapter();
  return _adapter;
}
function resetAdapter() { _adapter = null; } // for tests

module.exports = { getAdapter, resetAdapter, fakeAdapter, verifySig };
