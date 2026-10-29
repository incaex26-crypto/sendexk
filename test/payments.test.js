// Tests for B1 (payment provider interface), E2 (business OTP), E3 (store API keys).
const test = require('node:test'), assert = require('node:assert/strict');
const { createApp } = require('../server');
const { setup, P } = require('./helpers');
const S = require('../src/service');
const A = require('../src/auth');
const PAY = require('../src/payments');

async function boot() {
  const { db, region } = setup();
  A.initAuth(db);
  const srv = createApp({ db, regions: { [region.id]: region } });
  await new Promise((r) => srv.listen(0, r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const call = async (method, path, body, headers = {}) => {
    const r = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...headers }, body: body ? JSON.stringify(body) : undefined });
    const json = await r.json().catch(() => ({}));
    if (!r.ok) { const e = Object.assign(new Error(json.error || r.statusText), { status: r.status }); throw e; }
    return json;
  };
  const callRaw = async (method, path, body, headers = {}) => {
    const r = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...headers }, body: body ? JSON.stringify(body) : undefined });
    const json = await r.json().catch(() => ({}));
    return { ok: r.ok, status: r.status, headers: r.headers, json };
  };
  return { db, region, srv, call, callRaw };
}

const orderBody = (over = {}) => ({
  vehicleClass: 'car', weightKg: 2, category: 'parcel',
  sender: { name: 'Shop', phone: '0820000000' },
  recipient: { name: 'Sam', phone: '0831110000' },
  pickup: { ...P.sandton, address: 'Shop Sandton' },
  drop: { ...P.rosebank, address: 'Home Rosebank' },
  ...over,
});

test('B1: fakeAdapter createLink is idempotent per orderId', async () => {
  PAY.resetAdapter();
  const adapter = PAY.getAdapter();
  assert.ok(adapter.fake, 'should be fake adapter');
  const r1 = await adapter.createLink({ orderId: 1, cents: 5000, returnUrl: 'http://x/r?' });
  const r2 = await adapter.createLink({ orderId: 1, cents: 5000, returnUrl: 'http://x/r?' });
  assert.equal(r1.id, r2.id, 'same id returned for same orderId');
  assert.equal(r1.url, r2.url, 'same url returned for same orderId');
  PAY.resetAdapter();
});

test('B1: fakeAdapter verifyWebhook accepts fake-sig', () => {
  PAY.resetAdapter();
  const adapter = PAY.getAdapter();
  assert.ok(adapter.verifyWebhook('{}', 'fake-sig'), 'fake-sig accepted');
  assert.ok(!adapter.verifyWebhook('{}', 'wrong-sig'), 'wrong sig rejected');
  PAY.resetAdapter();
});

test('B1: POST /api/orders/:id/payment returns payUrl, duplicate returns same ref', async () => {
  PAY.resetAdapter();
  const { db, region, srv, call } = await boot();
  try {
    const biz = S.createAccount(db, region, { kind: 'business', name: 'BizA', phone: '0820001001' });
    const o = S.createOrder(db, region, orderBody({ accountId: biz }), 'pay-idem-1');

    const link1 = await call('POST', `/api/orders/${o.order.id}/payment`);
    assert.ok(link1.payUrl, 'payUrl returned');
    assert.ok(link1.ref, 'ref returned');

    const link2 = await call('POST', `/api/orders/${o.order.id}/payment`);
    assert.equal(link2.ref, link1.ref, 'duplicate call returns same ref');
  } finally {
    srv.close();
    PAY.resetAdapter();
  }
});

test('B1: POST /api/payment/webhook marks order paid, duplicate returns ok+duplicate', async () => {
  PAY.resetAdapter();
  const { db, region, srv, call, callRaw } = await boot();
  try {
    const biz = S.createAccount(db, region, { kind: 'business', name: 'BizB', phone: '0820001003' });
    const o = S.createOrder(db, region, orderBody({ accountId: biz, recipient: { name: 'Y', phone: '0820001004' } }), 'pay-wh-1');

    const whBody = { orderId: o.order.id, event: 'payment.complete', cents: o.order.cap_cents };
    const r1 = await call('POST', '/api/payment/webhook', whBody, { 'x-payment-sig': 'fake-sig' });
    assert.ok(r1.ok, 'webhook accepted');

    const r2 = await call('POST', '/api/payment/webhook', whBody, { 'x-payment-sig': 'fake-sig' });
    assert.ok(r2.ok && r2.duplicate, 'duplicate webhook returns ok+duplicate');

    const bad = await callRaw('POST', '/api/payment/webhook', whBody, { 'x-payment-sig': 'bad-sig' });
    assert.equal(bad.status, 401, 'invalid sig rejected with 401');
  } finally {
    srv.close();
    PAY.resetAdapter();
  }
});

test('E2: business OTP login sets biz_session cookie, wallet accessible', async () => {
  const { db, region, srv, call, callRaw } = await boot();
  try {
    S.createAccount(db, region, { kind: 'business', name: 'BizC', phone: '0820002001' });

    const otp = await callRaw('POST', '/api/business/otp', { phone: '0820002001' });
    assert.ok(otp.ok, 'OTP request ok');
    assert.ok(otp.json.devCode, 'devCode visible in dev mode (DEV=1)');

    const verify = await callRaw('POST', '/api/business/verify', { phone: '0820002001', code: otp.json.devCode });
    assert.ok(verify.ok, 'verify ok');
    const cookie = verify.headers.get('set-cookie') || '';
    assert.ok(cookie.includes('biz_session'), 'biz_session cookie set');

    const wallet = await callRaw('GET', '/api/wallet', null, { cookie });
    assert.ok(wallet.ok, 'wallet accessible with biz_session cookie');
    assert.equal(wallet.json.balanceCents, 0, 'new account starts at zero');

    const bad = await callRaw('POST', '/api/business/verify', { phone: '0820002001', code: '000000' });
    assert.equal(bad.status, 401, 'wrong code rejected');
  } finally {
    srv.close();
  }
});

test('E2: business OTP for unknown phone — code cannot be used to log in', async () => {
  const { srv, callRaw } = await boot();
  try {
    // Same response shape regardless to prevent phone probing
    const otp = await callRaw('POST', '/api/business/otp', { phone: '0820009999' });
    assert.ok(otp.ok, 'OTP request ok for unknown phone (same response shape)');
    // Even if devCode is returned (timing safety), it must not grant a session
    const code = otp.json.devCode || '000000';
    const bad = await callRaw('POST', '/api/business/verify', { phone: '0820009999', code });
    assert.equal(bad.status, 401, 'code from unknown phone cannot log in');
  } finally {
    srv.close();
  }
});

test('E3: store API keys — create, use via x-api-key, revoke', async () => {
  const { db, region, srv, call, callRaw } = await boot();
  try {
    const biz = S.createAccount(db, region, { kind: 'business', name: 'BizD', phone: '0820003001' });
    const BH = { 'x-account-id': String(biz) };

    const created = await call('POST', '/api/store/keys', { name: 'Test key' }, BH);
    assert.ok(created.key, 'raw key returned once');
    assert.ok(created.id, 'key id returned');

    const quote = await call('POST', '/api/store/quote', orderBody({ vehicleClass: 'car' }), { 'x-api-key': created.key });
    assert.ok(quote.token, 'store quote created with API key');

    const acct = A.keyToAccount(db, created.key);
    assert.equal(acct, biz, 'keyToAccount resolves correct account');

    await call('DELETE', `/api/store/keys/${created.id}`, {}, BH);
    const after = A.keyToAccount(db, created.key);
    assert.equal(after, null, 'revoked key no longer resolves');

    const dbl = await callRaw('DELETE', `/api/store/keys/${created.id}`, {}, BH);
    assert.equal(dbl.status, 409, 'double-revoke returns 409');
  } finally {
    srv.close();
  }
});

test('E3: store key from different account cannot be revoked', async () => {
  const { db, region, srv, call, callRaw } = await boot();
  try {
    const biz1 = S.createAccount(db, region, { kind: 'business', name: 'BizE', phone: '0820004001' });
    const biz2 = S.createAccount(db, region, { kind: 'business', name: 'BizF', phone: '0820004002' });

    const key1 = await call('POST', '/api/store/keys', { name: 'BizE key' }, { 'x-account-id': String(biz1) });
    const xacct = await callRaw('DELETE', `/api/store/keys/${key1.id}`, {}, { 'x-account-id': String(biz2) });
    assert.equal(xacct.status, 404, 'cross-account revoke returns 404');
  } finally {
    srv.close();
  }
});
