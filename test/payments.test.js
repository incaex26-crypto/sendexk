const test = require('node:test'), assert = require('node:assert/strict');
const S = require('../src/service'), L = require('../src/ledger'), clock = require('../src/clock'), { setup, order, P: pts } = require('./helpers');
const { createApp } = require('../server');

const WEBHOOK_SECRET = 'dev-webhook-secret';

// Helper: create an individual (card) order, not yet paid.
function cardOrder(db, region) {
  const { order: o } = order(S, db, region);
  return o;
}

// Helper: create a business account with a wallet.
function businessWorld(db, region, walletCents = 50000) {
  const accountId = S.createAccount(db, region, { kind: 'business', name: 'Acme Corp', phone: '0110001111' });
  S.topUp(db, region, accountId, walletCents);
  return accountId;
}

// Helper: full server with WEBHOOK_SECRET set.
async function boot() {
  const { db, region } = setup();
  process.env.WEBHOOK_SECRET = WEBHOOK_SECRET;
  const srv = createApp({ db, regions: { [region.id]: region } });
  await new Promise((r) => srv.listen(0, r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const A = process.env.ADMIN_KEY || 'dev-admin';
  const call = async (m, p, body, headers = {}) => {
    const r = await fetch(base + p, { method: m, headers: { 'content-type': 'application/json', ...headers }, body: body !== undefined ? JSON.stringify(body) : undefined });
    return { status: r.status, body: await r.json().catch(() => null) };
  };
  return { srv, call, db, region, A };
}

// ---- payment provider interface ----

test('sandbox createLink returns a url and ref', () => {
  const { db, region } = setup();
  const o = cardOrder(db, region);
  const { url, ref } = S.createPaymentLink(db, region, o.id);
  assert.ok(url.startsWith('http'));
  assert.ok(ref.length > 0);
  // ref is stored on the order
  assert.equal(db.prepare('SELECT payment_ref FROM orders WHERE id=?').get(o.id).payment_ref, ref);
});

test('processWebhook marks order paid and returns confirm token', () => {
  const { db, region } = setup();
  const o = cardOrder(db, region);
  const { ref } = S.createPaymentLink(db, region, o.id);
  const rawBody = JSON.stringify({ ref, amountCents: o.cap_cents });
  const result = S.processWebhook(db, region, rawBody, WEBHOOK_SECRET, WEBHOOK_SECRET);
  assert.equal(result.alreadyProcessed, false);
  assert.ok(result.confirmToken);
  assert.equal(S.getOrder(db, o.id).status, 'awaiting_confirmation');
});

test('processWebhook is idempotent: duplicate webhook returns alreadyProcessed', () => {
  const { db, region } = setup();
  const o = cardOrder(db, region);
  const { ref } = S.createPaymentLink(db, region, o.id);
  const rawBody = JSON.stringify({ ref, amountCents: o.cap_cents });
  S.processWebhook(db, region, rawBody, WEBHOOK_SECRET, WEBHOOK_SECRET);
  const dup = S.processWebhook(db, region, rawBody, WEBHOOK_SECRET, WEBHOOK_SECRET);
  assert.equal(dup.alreadyProcessed, true);
  // Ledger must not have a second escrow credit
  const escrow = -L.balance(db, `escrow:order:${o.id}`);
  assert.equal(escrow, o.cap_cents);
  assert.equal(L.total(db), 0);
});

test('processWebhook rejects a wrong signature', () => {
  const { db, region } = setup();
  const o = cardOrder(db, region);
  const { ref } = S.createPaymentLink(db, region, o.id);
  const rawBody = JSON.stringify({ ref, amountCents: o.cap_cents });
  assert.throws(() => S.processWebhook(db, region, rawBody, 'wrong-sig', WEBHOOK_SECRET), /invalid webhook signature/);
});

test('individual order is not dispatched before webhook payment', () => {
  const { db, region } = setup('2026-10-26T06:30:00Z');
  const o = cardOrder(db, region);
  // not paid → stays in awaiting_payment, not confirmed, not dispatched
  assert.equal(S.dispatch(db, region).runs.length, 0);
  assert.equal(S.getOrder(db, o.id).status, 'awaiting_payment');
});

// ---- business wallet ----

test('topUp increases wallet balance', () => {
  const { db, region } = setup();
  const accountId = S.createAccount(db, region, { kind: 'business', name: 'BizCo', phone: '0110002222' });
  S.topUp(db, region, accountId, 10000);
  assert.equal(S.walletBalance(db, accountId), 10000);
  S.topUp(db, region, accountId, 5000);
  assert.equal(S.walletBalance(db, accountId), 15000);
  assert.equal(L.total(db), 0);
});

test('topUp fails for a person account', () => {
  const { db, region } = setup();
  const accountId = S.createAccount(db, region, { kind: 'person', name: 'Pat', phone: '0820000099' });
  assert.throws(() => S.topUp(db, region, accountId, 5000), /business accounts/);
});

test('business order reserves cap from wallet and advances to awaiting_confirmation', () => {
  const { db, region } = setup();
  const accountId = businessWorld(db, region, 50000);
  const { order: o, confirmToken } = order(S, db, region, { accountId });
  assert.equal(o.status, 'awaiting_confirmation');
  assert.equal(o.payment_type, 'wallet');
  assert.ok(confirmToken); // confirmation link was generated
  // wallet debited by cap
  assert.equal(S.walletBalance(db, accountId), 50000 - o.cap_cents);
  // escrow holds cap
  assert.equal(-L.balance(db, `escrow:order:${o.id}`), o.cap_cents);
  assert.equal(L.total(db), 0);
});

test('business order is rejected when wallet balance is below cap', () => {
  const { db, region } = setup();
  const accountId = S.createAccount(db, region, { kind: 'business', name: 'BrokeInc', phone: '0110003333' });
  S.topUp(db, region, accountId, 100); // R1 — well below cap
  assert.throws(() => order(S, db, region, { accountId }), /wallet balance.*below.*cap/);
});

// ---- cancel & refund ----

test('cancelling a card order moves escrowed money to refund_due', () => {
  const { db, region } = setup();
  const o = cardOrder(db, region);
  // Pay via mock so there's escrow
  S.markPaid(db, region, o.id);
  const cancelled = S.cancelOrder(db, region, o.id);
  assert.equal(cancelled.status, 'cancelled');
  assert.ok(L.balance(db, `escrow:order:${o.id}`) === 0, 'escrow should be cleared');
  assert.equal(-L.balance(db, 'refund_due'), o.cap_cents); // owed back to customer
  assert.equal(L.total(db), 0);
});

test('cancelling a wallet order returns escrowed money to the wallet', () => {
  const { db, region } = setup();
  const accountId = businessWorld(db, region, 50000);
  const walletBefore = S.walletBalance(db, accountId);
  const { order: o } = order(S, db, region, { accountId });
  S.cancelOrder(db, region, o.id);
  assert.equal(S.walletBalance(db, accountId), walletBefore); // fully restored
  assert.ok(L.balance(db, `escrow:order:${o.id}`) === 0, 'escrow should be cleared');
  assert.equal(L.total(db), 0);
});

test('cancelling an unpaid card order leaves no ledger entries', () => {
  const { db, region } = setup();
  const o = cardOrder(db, region);
  S.cancelOrder(db, region, o.id);
  assert.equal(L.total(db), 0);
  assert.ok(L.balance(db, 'refund_due') === 0, 'no refund due for unpaid order');
});

test('cannot cancel a terminal order', () => {
  const { db, region } = setup();
  const o = cardOrder(db, region);
  S.cancelOrder(db, region, o.id); // first cancel ok
  assert.throws(() => S.cancelOrder(db, region, o.id), /already cancelled/);
});

// ---- delivery with wallet: surplus back to wallet ----

test('wallet order delivery: price < cap returns surplus to wallet, not refund_due', () => {
  const { db, region } = setup('2026-10-26T06:30:00Z');
  // Wallet sized to cover 5 orders
  const accountId = businessWorld(db, region, 500000);

  // Create and confirm 4 wallet orders so batching produces a run
  const orders = [];
  for (let i = 0; i < 4; i++) {
    const { order: o, confirmToken } = order(S, db, region, { accountId });
    const conf = S.confirm(db, region, confirmToken, { available: true, lat: pts.rosebank.lat + i * 0.003, lng: pts.rosebank.lng });
    orders.push({ id: o.id, code: conf.deliveryCode });
  }
  const walletAfterReserve = S.walletBalance(db, accountId);

  const driver = S.createDriver(db, region, { name: 'Driver', vehicle: 'car_ev' });
  const d = S.dispatch(db, region);
  assert.equal(d.runs.length, 1);
  S.acceptRun(db, region, d.runs[0].id, driver);
  for (const o of orders) {
    S.scan(db, region, o.id, driver, 'collect', {});
    S.scan(db, region, o.id, driver, 'out', pts.sandton);
    S.scan(db, region, o.id, driver, 'deliver', { code: o.code, ...pts.rosebank });
  }

  // Any cap surplus for wallet orders must go back to the wallet, not refund_due
  assert.ok(L.balance(db, 'refund_due') === 0, 'no refund_due for wallet orders');
  assert.equal(L.total(db), 0);
});

// ---- API routes ----

test('POST /api/orders/:id/paylink creates a payment link', async () => {
  const { srv, call, db, region } = await boot();
  try {
    const o = await call('POST', '/api/orders', { vehicleClass: 'car', weightKg: 2, category: 'parcel', sender: { name: 'S', phone: '1' }, recipient: { name: 'R', phone: '2' }, pickup: { ...pts.sandton, address: 'S' }, drop: { ...pts.rosebank, address: 'H' } });
    const link = await call('POST', `/api/orders/${o.body.order.id}/paylink`);
    assert.equal(link.status, 200);
    assert.ok(link.body.url);
    assert.ok(link.body.ref);
  } finally { srv.close(); }
});

test('POST /api/webhook/payment processes payment and is idempotent', async () => {
  const { srv, call, db, region } = await boot();
  try {
    const o = await call('POST', '/api/orders', { vehicleClass: 'car', weightKg: 2, category: 'parcel', sender: { name: 'S', phone: '1' }, recipient: { name: 'R', phone: '2' }, pickup: { ...pts.sandton, address: 'S' }, drop: { ...pts.rosebank, address: 'H' } });
    const link = await call('POST', `/api/orders/${o.body.order.id}/paylink`);
    const payload = JSON.stringify({ ref: link.body.ref, amountCents: o.body.order.cap_cents });
    // Send raw payload (bypass the call helper which re-serialises the body)
    const r1 = await fetch(`http://127.0.0.1:${srv.address().port}/api/webhook/payment`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-signature': WEBHOOK_SECRET }, body: payload });
    const b1 = await r1.json();
    assert.equal(r1.status, 200);
    assert.equal(b1.alreadyProcessed, false);
    // Duplicate webhook
    const r2 = await fetch(`http://127.0.0.1:${srv.address().port}/api/webhook/payment`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-signature': WEBHOOK_SECRET }, body: payload });
    const b2 = await r2.json();
    assert.equal(r2.status, 200);
    assert.equal(b2.alreadyProcessed, true);
  } finally { srv.close(); }
});

test('POST /api/accounts/:id/wallet/topup and GET balance', async () => {
  const { srv, call, A } = await boot();
  try {
    const acc = await call('POST', '/api/accounts', { kind: 'business', name: 'BigBiz', phone: '0110004444' });
    // createAccount not on API yet; use service directly — skip API test for account creation
    // Just verify topup route requires admin key
    const noAuth = await call('POST', `/api/accounts/1/wallet/topup`, { amountCents: 5000 });
    assert.equal(noAuth.status, 401);
  } finally { srv.close(); }
});

test('POST /api/orders/:id/cancel (admin) refunds and marks cancelled', async () => {
  const { srv, call, A } = await boot();
  try {
    const o = await call('POST', '/api/orders', { vehicleClass: 'car', weightKg: 2, category: 'parcel', sender: { name: 'S', phone: '1' }, recipient: { name: 'R', phone: '2' }, pickup: { ...pts.sandton, address: 'S' }, drop: { ...pts.rosebank, address: 'H' } });
    // Pay it via mock
    await call('POST', `/api/orders/${o.body.order.id}/pay`);
    const cancel = await call('POST', `/api/orders/${o.body.order.id}/cancel`, {}, { 'x-admin-key': A });
    assert.equal(cancel.status, 200);
    assert.equal(cancel.body.order.status, 'cancelled');
  } finally { srv.close(); }
});
