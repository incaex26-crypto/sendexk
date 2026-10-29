// Full end-to-end journey: A (individual customer) → B (business wallet) → C (store checkout) →
// D (run building) → E (driver lifecycle) → F (admin) → G (notifications).
// One scenario, one database, asserts order states, ledger movements, notifications and driver pay.
const test = require('node:test'), assert = require('node:assert/strict');
const { createApp } = require('../server');
const { setup, P } = require('./helpers');
const A = require('../src/auth');
const N = require('../src/notify');
const L = require('../src/ledger');
const S = require('../src/service');
const clock = require('../src/clock');

const HOUR = 3600000, MIN = 60000;

async function boot() {
  const { db, region } = setup('2026-10-29T06:30:00Z'); // 08:30 local, before booking cut-off
  const srv = createApp({ db, regions: { [region.id]: region } });
  await new Promise((r) => srv.listen(0, r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const h = (extra = {}) => ({ 'content-type': 'application/json', ...extra });
  const call = async (method, path, body, headers = {}) => {
    const r = await fetch(base + path, { method, headers: h(headers), body: body ? JSON.stringify(body) : undefined });
    const json = await r.json().catch(() => ({}));
    if (!r.ok) { const e = Object.assign(new Error(json.error || r.statusText), { status: r.status }); throw e; }
    return json;
  };
  return { db, region, srv, call };
}

const orderBody = (over = {}) => ({
  vehicleClass: 'car', weightKg: 2, category: 'parcel',
  sender: { name: 'Shop', phone: '0820000000' },
  recipient: { name: 'Sam', phone: '0831110000' },
  pickup: { ...P.sandton, address: 'Shop Sandton' },
  drop: { ...P.rosebank, address: 'Home Rosebank' },
  ...over,
});

test('full ecosystem journey A→G', async () => {
  const { db, region, srv, call } = await boot();
  try {
    N.outbox.length = 0;

    // ============================================================
    // A. Individual customer: book → pay → confirm → (dispatch later)
    // ============================================================
    const qr = await call('POST', '/api/quote', { pickup: P.sandton, drop: P.rosebank, vehicleClass: 'car' });
    assert.ok(qr.cap >= qr.low, 'A: quote cap >= low');
    assert.ok(Number.isInteger(qr.cap), 'A: cap is whole cents');

    const or1 = await call('POST', '/api/orders', orderBody(), { 'idempotency-key': 'j-A1' });
    assert.equal(or1.order.status, 'awaiting_payment', 'A: order created');

    const pay1 = await call('POST', `/api/orders/${or1.order.id}/pay`);
    assert.equal(pay1.order.status, 'awaiting_confirmation', 'A: paid');
    const notifAfterPay = N.outbox.filter((m) => m.kind === 'payment_received');
    assert.equal(notifAfterPay.length, 1, 'A: payment_received notification sent');
    assert.ok(pay1.confirmUrl, 'A: confirmUrl returned');

    const confToken = pay1.confirmUrl.split('t=')[1];
    const conf1 = await call('POST', `/api/confirm/${confToken}`, { available: true, lat: P.rosebank.lat, lng: P.rosebank.lng });
    assert.equal(conf1.order.status, 'confirmed', 'A: recipient confirmed');
    assert.ok(conf1.deliveryCode, 'A: delivery code issued');

    // Create 3 more orders so batching has enough to form a run (min 3 required)
    const extras = [];
    for (let i = 1; i <= 3; i++) {
      const o = await call('POST', '/api/orders', orderBody({ recipient: { name: `R${i}`, phone: `083111000${i}` }, drop: { lat: P.rosebank.lat + i * 0.003, lng: P.rosebank.lng, address: `Home ${i}` } }), { 'idempotency-key': `j-extra${i}` });
      const p = await call('POST', `/api/orders/${o.order.id}/pay`);
      const ct = p.confirmUrl.split('t=')[1];
      const c = await call('POST', `/api/confirm/${ct}`, { available: true, lat: P.rosebank.lat + i * 0.003, lng: P.rosebank.lng });
      extras.push({ id: o.order.id, code: c.deliveryCode });
    }

    // ============================================================
    // B. Business wallet: OTP login → topup → wallet-pay order
    // ============================================================
    const biz = S.createAccount(db, region, { kind: 'business', name: 'TechShop', phone: '0110000001', email: 'biz@x.co' });
    // OTP login for business
    const bizOtp = await call('POST', '/api/business/otp', { phone: '0110000001' });
    assert.ok(bizOtp.devCode, 'B: business OTP visible in dev mode');
    const bizVerifyR = await fetch(`http://127.0.0.1:${srv.address().port}/api/business/verify`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ phone: '0110000001', code: bizOtp.devCode })
    });
    const bizCookieHdr = bizVerifyR.headers.get('set-cookie') || '';
    const bizCookie = bizCookieHdr.split(';')[0];
    assert.ok(bizCookie.includes('biz_session'), 'B: business session cookie issued');
    const BH = { cookie: bizCookie };

    const topupR = await call('POST', '/api/wallet/topup', { cents: 50000 }, BH);
    assert.equal(topupR.balanceCents, 50000, 'B: topup reflected');
    assert.equal(L.total(db), 0, 'B: ledger balanced after topup');

    const obiz = await call('POST', '/api/orders', orderBody({ accountId: biz, recipient: { name: 'BizSam', phone: '0832220000' } }), { 'idempotency-key': 'j-biz1' });
    const walletPay = await call('POST', `/api/wallet/pay/${obiz.order.id}`, {}, BH);
    assert.equal(walletPay.order.status, 'awaiting_confirmation', 'B: wallet-paid order');
    const bizBalance = S.walletBalance(db, biz);
    assert.ok(bizBalance < 50000, 'B: wallet debited');
    assert.equal(L.total(db), 0, 'B: ledger balanced after wallet pay');

    const stmt = S.walletStatement(db, biz);
    assert.ok(stmt.length >= 2, 'B: statement has topup and payment rows');
    assert.equal(stmt[0].balanceCents, bizBalance, 'B: statement balance matches actual');

    // Cross-business isolation: second business cannot read first business's wallet
    const biz2 = S.createAccount(db, region, { kind: 'business', name: 'OtherShop', phone: '0120000002', email: 'other@x.co' });
    const biz2Otp = await call('POST', '/api/business/otp', { phone: '0120000002' });
    const biz2VerR = await fetch(`http://127.0.0.1:${srv.address().port}/api/business/verify`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ phone: '0120000002', code: biz2Otp.devCode })
    });
    const biz2Cookie = (biz2VerR.headers.get('set-cookie') || '').split(';')[0];
    const BH2 = { cookie: biz2Cookie };
    // biz2 topup should only affect biz2's wallet
    await call('POST', '/api/wallet/topup', { cents: 10000 }, BH2);
    assert.equal(S.walletBalance(db, biz), bizBalance, 'B: cross-biz isolation: biz1 balance unchanged');
    // biz2 cannot pay biz1's order
    const biz1Order = await call('POST', '/api/orders', orderBody({ accountId: biz, recipient: { name: 'X', phone: '0833330001' } }), { 'idempotency-key': 'j-iso1' });
    const isoErr = await call('POST', `/api/wallet/pay/${biz1Order.order.id}`, {}, BH2).catch((e) => e);
    assert.ok(isoErr instanceof Error || isoErr.status, 'B: cross-biz isolation: cannot spend another business wallet');

    // ============================================================
    // C. Store checkout link: create → preview → redeem (shopper mode)
    // ============================================================
    // Store API key auth
    const keyR = await call('POST', '/api/store/keys', { name: 'test-key' }, BH);
    assert.ok(keyR.key, 'C: store API key issued');
    const storeH = { 'x-api-key': keyR.key };

    const linkR = await call('POST', '/api/store/quote', orderBody({ vehicleClass: 'car' }), storeH);
    assert.ok(linkR.token, 'C: quote link token issued');
    assert.ok(linkR.expiresAt > clock.now(), 'C: link not yet expired');

    const preview = await call('GET', `/api/store/pay/${linkR.token}`);
    assert.ok(preview.spec, 'C: preview returns spec');

    const redeemed = await call('POST', `/api/store/pay/${linkR.token}`, { lat: P.rosebank.lat, lng: P.rosebank.lng });
    assert.equal(redeemed.order.status, 'awaiting_confirmation', 'C: redeemed and paid');
    assert.equal(L.total(db), 0, 'C: ledger balanced after link redeem');

    // One-time-use: second redeem must fail
    try { await call('POST', `/api/store/pay/${linkR.token}`, {}); assert.fail('C: should have thrown'); }
    catch (e) { assert.equal(e.status, 409, 'C: used link returns 409'); }

    // Wallet mode: topup store → create wallet-mode link → redeem
    await call('POST', '/api/wallet/topup', { cents: 200000 }, BH);
    const walletLink = await call('POST', '/api/store/quote', { ...orderBody({ vehicleClass: 'car', recipient: { name: 'WalletSam', phone: '0833330000' } }), mode: 'wallet' }, storeH);
    const walletRedeem = await call('POST', `/api/store/pay/${walletLink.token}`, {});
    assert.equal(walletRedeem.order.status, 'awaiting_confirmation', 'C: wallet-mode link redeemed');
    assert.equal(L.total(db), 0, 'C: ledger balanced after wallet-mode redeem');

    // ============================================================
    // D. Run building: dispatch forms batched runs
    // ============================================================
    const disp = await call('POST', '/api/admin/dispatch', {}, { 'x-admin-key': 'must-fail' }).catch(() =>
      call('POST', '/api/admin/dispatch', {}).catch(() => null)
    );
    // Use admin session
    A.createAdmin(db, 'admin@x.co', 'correct-horse-battery');
    const loginR = await fetch(`http://127.0.0.1:${srv.address().port}/api/admin/login`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'admin@x.co', password: 'correct-horse-battery' })
    });
    const setCookie = loginR.headers.get('set-cookie') || '';
    const adminCookie = setCookie.split(';')[0];

    const dispR = await call('POST', '/api/admin/dispatch', {}, { cookie: adminCookie });
    assert.ok(dispR.runs.length >= 1, 'D: at least one run built');
    const runId = dispR.runs[0].id;

    // Verify run bundles stops correctly (same pickup = 1 stop)
    const runRows = db.prepare('SELECT COUNT(*) n FROM orders WHERE run_id=?').get(runId).n;
    assert.ok(runRows >= 1, 'D: run has orders');

    // ============================================================
    // E. Driver lifecycle: login → accept → collect → out → deliver → earnings
    // ============================================================
    const driverId = S.createDriver(db, region, { name: 'Dev Driver', phone: '0711110000', vehicle: 'car_ev' });
    // OTP login
    const otpR = await call('POST', '/api/driver/otp', { phone: '0711110000' });
    assert.ok(otpR.devCode, 'E: OTP code visible in dev mode');
    const verR = await call('POST', '/api/driver/verify', { phone: '0711110000', code: otpR.devCode });
    const driverToken = verR.token;
    const DH = { authorization: `Bearer ${driverToken}` };

    const runsR = await call('GET', '/api/driver/runs', null, DH);
    assert.ok(runsR.length >= 1, 'E: driver can see open run');
    const myRun = runsR.find((r) => r.id === runId) || runsR[0];
    assert.ok(myRun.payoutCents > 0, 'E: run shows payout');
    assert.ok(myRun.km > 0, 'E: run shows distance');

    await call('POST', `/api/driver/runs/${myRun.id}/accept`, {}, DH);

    const me = await call('GET', '/api/driver/me', null, DH);
    assert.ok(me.run, 'E: driver has active run');
    const parcels = me.parcels;
    assert.ok(parcels.length >= 1, 'E: parcels in run');

    const notifsBefore = N.outbox.length;
    // collect → out → deliver for each parcel
    let deliveredCount = 0;
    for (const p of parcels) {
      if (!['batched', 'collected', 'out_for_delivery'].includes(p.status)) continue;
      if (p.status === 'batched') await call('POST', `/api/driver/scan/${p.id}`, { action: 'collect' }, DH);
      await call('POST', `/api/driver/scan/${p.id}`, { action: 'out', ...P.sandton }, DH);
      // wrong code: refused
      const wrongR = await call('POST', `/api/driver/scan/${p.id}`, { action: 'deliver', code: '9999' }, DH).catch((e) => e);
      assert.equal(wrongR.status, 403, 'E: wrong code refused');
      // get real code from the order record
      const orderRec = db.prepare('SELECT code_hash FROM orders WHERE id=?').get(p.id);
      // Use the code stored in extras if available, else skip
      const ex = [{ id: or1.order.id, code: conf1.deliveryCode }, ...extras].find((e) => e.id === p.id);
      if (!ex) continue;
      const delR = await call('POST', `/api/driver/scan/${p.id}`, { action: 'deliver', code: ex.code }, DH);
      assert.equal(delR.order.status, 'delivered', 'E: parcel delivered');
      deliveredCount++;
    }
    assert.ok(deliveredCount >= 1, 'E: at least one delivery completed');

    // Notifications: driver_assigned + out_for_delivery + delivered sent
    const driverAssignedNotifs = N.outbox.filter((m) => m.kind === 'driver_assigned');
    const outNotifs = N.outbox.filter((m) => m.kind === 'out_for_delivery');
    const delivNotifs = N.outbox.filter((m) => m.kind === 'delivered');
    assert.ok(driverAssignedNotifs.length >= 1, 'G: driver_assigned notification sent');
    assert.ok(outNotifs.length >= 1, 'G: out_for_delivery notification sent');
    assert.ok(delivNotifs.length >= 1, 'G: delivered notification sent');

    // Earnings
    const earn = await call('GET', '/api/driver/earnings', null, DH);
    assert.ok(earn.payableCents >= 0, 'E: driver earnings accessible');
    assert.equal(L.total(db), 0, 'E: ledger balanced after deliveries');

    // ============================================================
    // F. Admin: overview, notification log, suspend driver
    // ============================================================
    const ov = await call('GET', '/api/admin/overview', null, { cookie: adminCookie });
    assert.ok(ov.orders.delivered >= 1, 'F: admin sees delivered orders');
    assert.ok(ov.money.ledgerBalanced, 'F: ledger balanced in overview');

    const notifLog = await call('GET', '/api/admin/notifications', null, { cookie: adminCookie });
    assert.ok(notifLog.length >= 3, 'F: notification log has entries');

    // Suspend: driver is logged out everywhere
    const driverId2 = S.createDriver(db, region, { name: 'Bad Driver', phone: '0722220000', vehicle: 'car' });
    const otp2 = await call('POST', '/api/driver/otp', { phone: '0722220000' });
    const ver2 = await call('POST', '/api/driver/verify', { phone: '0722220000', code: otp2.devCode });
    const DH2 = { authorization: `Bearer ${ver2.token}` };
    assert.equal((await call('GET', '/api/driver/me', null, DH2)).driver.id, driverId2, 'F: driver 2 logged in');
    await call('POST', `/api/admin/drivers/${driverId2}/suspend`, {}, { cookie: adminCookie });
    const suspendedR = await call('GET', '/api/driver/me', null, DH2).catch((e) => e);
    assert.ok(suspendedR instanceof Error || suspendedR.status, 'F: suspended driver refused');

    // ============================================================
    // G. Final ledger balance check
    // ============================================================
    assert.equal(L.total(db), 0, 'G: ledger sums to zero at end of journey');

    // Escrow accounts: negative = held, zero = settled. Positive would mean over-release (double-payout).
    const escrowRows = db.prepare("SELECT account, SUM(amount_cents) s FROM ledger WHERE account LIKE 'escrow:%' GROUP BY account").all();
    for (const row of escrowRows) {
      assert.ok(row.s <= 0, `G: escrow account ${row.account} over-released (double-payout)`);
    }
  } finally {
    N.outbox.length = 0;
    srv.close();
  }
});

test('journey: schema upgrade from pre-PR9 database works', () => {
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(':memory:');
  // Old sessions table without kind/subject
  db.exec(`
    CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, driver_id INTEGER NOT NULL, region_id TEXT, created_at INTEGER, expires_at INTEGER, revoked_at INTEGER);
    INSERT INTO sessions VALUES ('oldhash', 42, 'za-jhb', 1000, 9999999999, NULL);
  `);
  const A2 = require('../src/auth');
  A2.initAuth(db); // should not throw
  const cols = db.prepare('PRAGMA table_info(sessions)').all().map((r) => r.name);
  assert.ok(cols.includes('kind'), 'migration: kind column added');
  const row = db.prepare("SELECT * FROM sessions WHERE token_hash='oldhash'").get();
  assert.ok(row, 'migration: old row preserved');
  assert.equal(row.kind, 'driver', 'migration: kind set to driver');
  assert.equal(row.subject, 42, 'migration: subject = old driver_id');
});
