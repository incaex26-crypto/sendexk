// Payment provider interface.
// Fake adapter is the default (sandbox). Swap via PAYMENT_ADAPTER env var.
// Interface: { createLink(opts), verifyWebhook(rawBody, sig), fake?, outbox? }
const crypto = require('node:crypto');

// HMAC-SHA256 check for real providers — returns bool (timing-safe).
function verifySig(rawBody, sig, secret) {
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const eBuf = Buffer.from(expected, 'hex');
  const aBuf = Buffer.from(sig, 'hex');
  if (eBuf.length !== aBuf.length) return false;
  return crypto.timingSafeEqual(eBuf, aBuf);
}

// Fake adapter: no real HTTP calls. Stores pending links in memory.
function fakeAdapter() {
  const pending = new Map(); // orderId → { id, url }
  const outbox = [];
  return {
    fake: true, outbox,
    async createLink({ orderId, cents, returnUrl }) {
      if (pending.has(orderId)) return pending.get(orderId); // idempotent
      const id = 'pay_' + crypto.randomBytes(8).toString('hex');
      const url = returnUrl + '&pay_ref=' + id;
      const result = { id, url };
      pending.set(orderId, result);
      outbox.push({ orderId, id, cents, url });
      return result;
    },
    verifyWebhook(rawBody, sig) {
      return sig === 'fake-sig'; // test helper bypasses real HMAC
    },
    // Test helper: produce a webhook payload and signature
    complete(orderId) {
      const payload = JSON.stringify({ orderId, event: 'payment.complete', cents: 0 });
      return { payload, sig: 'fake-sig' };
    },
  };
}

let _adapter = null;
function getAdapter() { if (!_adapter) _adapter = fakeAdapter(); return _adapter; }
function resetAdapter() { _adapter = null; }

module.exports = { getAdapter, resetAdapter, fakeAdapter, verifySig };
