// Tests for Stage 3 P1 items: B6, B7, D3, D4, E4, G3, G4.
const test = require('node:test'), assert = require('node:assert/strict');
const { createApp } = require('../server');
const { setup, P } = require('./helpers');
const S = require('../src/service');
const A = require('../src/auth');
const clock = require('../src/clock');

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
  const raw = async (method, path, body, headers = {}) => {
    const r = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...headers }, body: body ? JSON.stringify(body) : undefined });
    const json = await r.json().catch(() => ({}));
    return { ok: r.ok, status: r.status, json };
  };
  return { db, region, srv, call, raw };
}

const orderBody = (over = {}) => ({
  vehicleClass: 'car', weightKg: 2, category: 'parcel',
  sender: { name: 'Shop', phone: '0820000000' },
  recipient: { name: 'Sam', phone: '0831110000' },
  pickup: { ...P.sandton, address: 'Shop Sandton' },
  drop: { ...P.rosebank, address: 'Home Rosebank' },
  ...over,
});

// ---- B6: driver weekly statement ----
test('B6: GET /api/driver/statement returns weeks and payouts', async () => {
  const { db, region, srv, call } = await boot();
  try {
    const d = S.createDriver(db, region, { name: 'Driver A', phone: '0810001001', vehicle: 'car' });
    const DH = { 'x-driver-id': String(d) };
    const stmt = await call('GET', '/api/driver/statement', null, DH);
    assert.ok(Array.isArray(stmt.weeks), 'weeks array returned');
    assert.ok(Array.isArray(stmt.payouts), 'payouts array returned');
    assert.equal(stmt.weeks.length, 0, 'no weeks for driver with no completed runs');
  } finally { srv.close(); }
});

// ---- B7: cancel order with ledger refund ----
test('B7: cancel order (awaiting_payment) — no refund needed', async () => {
  const { db, region, srv, call } = await boot();
  try {
    const biz = S.createAccount(db, region, { kind: 'business', name: 'BizX', phone: '0820005001' });
    const o = S.createOrder(db, region, orderBody({ accountId: biz }), 'cancel-1');
    const r = await call('POST', `/api/orders/${o.order.id}/cancel`, { reason: 'test' }, { 'x-account-id': String(biz) });
    assert.equal(r.refundCents, 0, 'no refund for unpaid order');
    const after = S.getOrder(db, o.order.id);
    assert.equal(after.status, 'cancelled', 'order status is cancelled');
  } finally { srv.close(); }
});

test('B7: cancel order after payment — refund goes to refund_due', async () => {
  const { db, region, srv, call } = await boot();
  try {
    const biz = S.createAccount(db, region, { kind: 'business', name: 'BizY', phone: '0820005002' });
    const o = S.createOrder(db, region, orderBody({ accountId: biz }), 'cancel-2');
    // Pay using dev shortcut
    await call('POST', `/api/orders/${o.order.id}/pay`);
    // Confirm drop pin
    const track = await call('GET', `/api/orders/${o.order.id}/track`);
    // Order is now awaiting_confirmation — can still cancel
    const r = await call('POST', `/api/orders/${o.order.id}/cancel`, { reason: 'test' }, { 'x-account-id': String(biz) });
    assert.ok(r.refundCents > 0, 'refund credited for paid order');
    const after = S.getOrder(db, o.order.id);
    assert.equal(after.status, 'cancelled');
  } finally { srv.close(); }
});

test('B7: cancel delivered order throws 409', async () => {
  const { db, region, srv, raw } = await boot();
  try {
    const biz = S.createAccount(db, region, { kind: 'business', name: 'BizZ', phone: '0820005003' });
    const o = S.createOrder(db, region, orderBody({ accountId: biz }), 'cancel-3');
    // Drive to delivered via service directly
    const ord = db.prepare("UPDATE orders SET status='delivered' WHERE id=?").run(o.order.id);
    const r = await raw('POST', `/api/orders/${o.order.id}/cancel`, { reason: 'too late' }, { 'x-account-id': String(biz) });
    assert.equal(r.status, 409, 'cannot cancel delivered order');
  } finally { srv.close(); }
});

// ---- D3: driver onboarding ----
test('D3: submit document, pending approvals, approve driver', async () => {
  const { db, region, srv, call } = await boot();
  try {
    const email = 'd3test@example.com', pw = 'Password123!';
    A.createAdmin(db, email, pw);
    const adminCookie = await (async () => {
      const r = await fetch(`http://127.0.0.1:${srv.address().port}/api/admin/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: pw }) });
      return r.headers.get('set-cookie') || '';
    })();

    const d = S.createDriver(db, region, { name: 'Driver D3', phone: '0810002001', vehicle: 'car' });
    const DH = { 'x-driver-id': String(d) };

    // Submit a document
    const doc = await call('POST', '/api/driver/documents', { kind: 'id', fileRef: 'id-scan-001.jpg' }, DH);
    assert.equal(doc.kind, 'id');
    assert.equal(doc.status, 'pending');

    // Admin sees it in approvals
    const approvals = await call('GET', '/api/admin/approvals', null, { cookie: adminCookie });
    assert.ok(Array.isArray(approvals), 'approvals list returned');
    const found = approvals.find(a => a.id === d);
    assert.ok(found, 'driver with pending doc appears');

    // Admin approves
    const result = await call('POST', `/api/admin/drivers/${d}/approve`, { note: 'Looks good' }, { cookie: adminCookie });
    assert.equal(result.status, 'approved');

    // No longer in pending approvals
    const after = await call('GET', '/api/admin/approvals', null, { cookie: adminCookie });
    assert.ok(!after.find(a => a.id === d), 'approved driver no longer in pending list');
  } finally { srv.close(); }
});

test('D3: reject driver with note', async () => {
  const { db, region, srv, call } = await boot();
  try {
    const email = 'd3rej@example.com', pw = 'Password123!';
    A.createAdmin(db, email, pw);
    const r = await fetch(`http://127.0.0.1:${srv.address().port}/api/admin/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: pw }) });
    const adminCookie = r.headers.get('set-cookie') || '';

    const d = S.createDriver(db, region, { name: 'Driver Rej', phone: '0810003001', vehicle: 'car' });
    const DH = { 'x-driver-id': String(d) };
    await call('POST', '/api/driver/documents', { kind: 'pdp', fileRef: 'pdp.jpg' }, DH);

    const res = await call('POST', `/api/admin/drivers/${d}/reject`, { note: 'Expired PDP' }, { cookie: adminCookie });
    assert.equal(res.status, 'rejected');
  } finally { srv.close(); }
});

// ---- D4: proof of delivery photo ----
test('D4: photo reference recorded during out_for_delivery', async () => {
  const { db, region, srv, call } = await boot();
  try {
    const biz = S.createAccount(db, region, { kind: 'business', name: 'BizPh', phone: '0820006001' });
    const d = S.createDriver(db, region, { name: 'Driver Ph', phone: '0810004001', vehicle: 'car' });
    const o = S.createOrder(db, region, orderBody({ accountId: biz }), 'photo-1');
    // Force order to out_for_delivery
    db.prepare("UPDATE orders SET status='out_for_delivery', run_id=1 WHERE id=?").run(o.order.id);
    const r = await call('POST', `/api/driver/scan/${o.order.id}/photo`, { photoRef: 'proof-001.jpg' }, { 'x-driver-id': String(d) });
    assert.ok(r.ok, 'photo reference recorded');
    assert.equal(r.photoRef, 'proof-001.jpg');
  } finally { srv.close(); }
});

// ---- E4: store plugin spec ----
test('E4: GET /api/store/plugin/woocommerce returns spec', async () => {
  const { srv, call } = await boot();
  try {
    const spec = await call('GET', '/api/store/plugin/woocommerce');
    assert.ok(spec.webhookUrl, 'webhookUrl in spec');
    assert.ok(spec.samplePayload, 'samplePayload in spec');
    assert.ok(spec.note, 'note about full plugin pending');
  } finally { srv.close(); }
});

// ---- G3: platform settings ----
test('G3: admin can read and write platform settings', async () => {
  const { db, region, srv, call } = await boot();
  try {
    const email = 'g3@example.com', pw = 'Password123!';
    A.createAdmin(db, email, pw);
    const r = await fetch(`http://127.0.0.1:${srv.address().port}/api/admin/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: pw }) });
    const adminCookie = r.headers.get('set-cookie') || '';

    // Empty settings initially
    const list0 = await call('GET', '/api/admin/settings', null, { cookie: adminCookie });
    assert.ok(Array.isArray(list0), 'settings list returned');

    // Write a setting
    const saved = await call('PUT', '/api/admin/settings/platform_share_pct', { value: 18 }, { cookie: adminCookie });
    assert.equal(saved.key, 'platform_share_pct');
    assert.equal(saved.value, 18);

    // Read back
    const list1 = await call('GET', '/api/admin/settings', null, { cookie: adminCookie });
    const found = list1.find(s => s.key === 'platform_share_pct');
    assert.ok(found, 'setting persisted');
    assert.equal(found.value, 18);

    // Update it
    await call('PUT', '/api/admin/settings/platform_share_pct', { value: 20 }, { cookie: adminCookie });
    const list2 = await call('GET', '/api/admin/settings', null, { cookie: adminCookie });
    assert.equal(list2.find(s => s.key === 'platform_share_pct').value, 20, 'setting updated');
  } finally { srv.close(); }
});

test('G3: settings endpoint requires admin auth', async () => {
  const { srv, raw } = await boot();
  try {
    const r = await raw('GET', '/api/admin/settings');
    assert.equal(r.status, 401, 'requires admin login');
  } finally { srv.close(); }
});

// ---- G4: disputes ----
test('G4: open dispute, list, resolve', async () => {
  const { db, region, srv, call } = await boot();
  try {
    const email = 'g4@example.com', pw = 'Password123!';
    A.createAdmin(db, email, pw);
    const r = await fetch(`http://127.0.0.1:${srv.address().port}/api/admin/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: pw }) });
    const adminCookie = r.headers.get('set-cookie') || '';

    const biz = S.createAccount(db, region, { kind: 'business', name: 'BizD', phone: '0820007001' });
    const o = S.createOrder(db, region, orderBody({ accountId: biz }), 'dispute-1');

    // Open a dispute
    const dispute = await call('POST', `/api/orders/${o.order.id}/dispute`, { reason: 'parcel not delivered' }, { 'x-account-id': String(biz) });
    assert.ok(dispute.id, 'dispute id returned');
    assert.equal(dispute.status, 'open');

    // Admin lists disputes
    const list = await call('GET', '/api/admin/disputes', null, { cookie: adminCookie });
    assert.ok(Array.isArray(list), 'disputes list returned');
    const found = list.find(d => d.id === dispute.id);
    assert.ok(found, 'dispute in list');

    // Admin resolves
    const resolved = await call('POST', `/api/admin/disputes/${dispute.id}/resolve`, { note: 'Refund issued' }, { cookie: adminCookie });
    assert.equal(resolved.status, 'resolved');

    // No longer in open list
    const list2 = await call('GET', '/api/admin/disputes', null, { cookie: adminCookie });
    assert.ok(!list2.find(d => d.id === dispute.id), 'resolved dispute not in open list');
  } finally { srv.close(); }
});
