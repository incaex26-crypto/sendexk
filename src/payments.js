// Payment provider interface. Switch providers via PAYMENT_PROVIDER env var (default: sandbox).
//
// Each provider must implement:
//   createLink(orderId, amountCents) → { url, ref }
//   verifySignature(rawBody, sig, secret) → boolean
//   parseWebhook(rawBody) → { ref, amountCents }
//
// The ref is stored on the order and used for idempotency: if a webhook arrives for an order
// that is no longer in awaiting_payment, it is silently accepted as a duplicate.

const sandbox = {
  name: 'sandbox',
  createLink: (orderId, amountCents) => ({
    url: `http://pay.test/sandbox?order=${orderId}&amount=${amountCents}`,
    ref: `sbx_${orderId}`,
  }),
  // Signature check: sig must equal secret. Tests pass WEBHOOK_SECRET (or 'dev-webhook-secret') as sig.
  verifySignature: (_rawBody, sig, secret) => sig === secret,
  parseWebhook: (rawBody) => {
    const d = JSON.parse(rawBody);
    return { ref: d.ref, amountCents: d.amountCents };
  },
};

const PROVIDERS = { sandbox };

function getProvider() {
  const name = process.env.PAYMENT_PROVIDER || 'sandbox';
  const p = PROVIDERS[name];
  if (!p) throw Object.assign(new Error(`payment provider '${name}' not configured`), { status: 503 });
  return p;
}

module.exports = { getProvider, sandbox };
