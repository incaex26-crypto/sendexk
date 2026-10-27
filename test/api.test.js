const test = require('node:test'), assert = require('node:assert/strict');
const { createApp } = require('../server'), { setup, P: pts } = require('./helpers'), S = require('../src/service');

async function boot() {
  const { db, region } = setup(); const srv = createApp({ db, regions: { [region.id]: region } });
  await new Promise((r) => srv.listen(0, r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const call = async (m, p, body, headers = {}) => { const r = await fetch(base + p, { method: m, headers: { 'content-type': 'application/json', ...headers }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, body: await r.json().catch(() => null) }; };
  return { srv, call, db, region };
}
const C = require('../src/confirm'), clock = require('../src/clock');
process.env.OTP_DEV_CODES = '1'; // no SMS provider: tests read the code from the reply, like `npm run dev`
const ADMIN = { 'x-admin-key': 'dev-admin' };
async function driverLogin(call, phone) {
  assert.equal((await call('POST', '/api/drivers', { name: 'T', vehicle: 'car_ev', phone }, ADMIN)).status, 201);
  const otp = await call('POST', '/api/auth/otp', { phone }); assert.match(otp.body.devCode, /^\d{6}$/);
  const v = await call('POST', '/api/auth/verify', { phone, code: otp.body.devCode }); assert.equal(v.status, 200);
  return { authorization: 'Bearer ' + v.body.token };
}
const orderBody = (i) => ({ vehicleClass: 'car', weightKg: 2, category: 'parcel', sender: { name: 'Shop', phone: '1' }, recipient: { name: 'R' + i, phone: '2' }, pickup: { ...pts.sandton, address: 'S' }, drop: { lat: pts.rosebank.lat + i * 0.003, lng: pts.rosebank.lng, address: 'H' + i } });

test('API end to end: quote, book, pay, confirm, dispatch, accept, deliver', async () => {
  const { srv, call } = await boot();
  try {
    const q = await call('POST', '/api/quote', { pickup: pts.sandton, drop: pts.rosebank, vehicleClass: 'car' });
    assert.equal(q.status, 200); assert.ok(q.body.cap >= q.body.low);
    const confirmations = [];
    for (let i = 0; i < 4; i++) {
      const o = await call('POST', '/api/orders', orderBody(i), { 'idempotency-key': 'k' + i }); assert.equal(o.status, 201);
      const dup = await call('POST', '/api/orders', orderBody(i), { 'idempotency-key': 'k' + i }); assert.equal(dup.status, 200); assert.equal(dup.body.order.id, o.body.order.id);
      assert.equal(o.body.order.token_hash, undefined);
      const p = await call('POST', `/api/orders/${o.body.order.id}/pay`); const t = p.body.confirmUrl.split('t=')[1];
      const prev = await call('GET', `/api/confirm/${t}`); assert.equal(prev.status, 200);
      const c = await call('POST', `/api/confirm/${t}`, { available: true, lat: pts.rosebank.lat + i * 0.003, lng: pts.rosebank.lng });
      confirmations.push({ id: o.body.order.id, code: c.body.deliveryCode });
    }
    assert.equal((await call('POST', '/api/admin/dispatch', {})).status, 401);
    const d = await call('POST', '/api/admin/dispatch', {}, { 'x-admin-key': 'dev-admin' }); assert.equal(d.body.runs.length, 1);
    const H = await driverLogin(call, '0821234567');
    assert.equal((await call('GET', '/api/driver/runs')).status, 401);
    const runs = await call('GET', '/api/driver/runs', null, H); assert.equal(runs.body.length, 1);
    assert.equal((await call('POST', `/api/driver/runs/${runs.body[0].id}/accept`, {}, H)).status, 200);
    for (const c of confirmations) {
      await call('POST', `/api/driver/scan/${c.id}`, { action: 'collect' }, H);
      const out = await call('POST', `/api/driver/scan/${c.id}`, { action: 'out', ...pts.sandton }, H); assert.ok(out.body.eta.to > out.body.eta.from);
      assert.equal((await call('POST', `/api/driver/scan/${c.id}`, { action: 'deliver', code: 'nope' }, H)).status, 403);
      assert.equal((await call('POST', `/api/driver/scan/${c.id}`, { action: 'deliver', code: c.code }, H)).body.order.status, 'delivered');
    }
    const ov = await call('GET', '/api/admin/overview', null, { 'x-admin-key': 'dev-admin' });
    assert.equal(ov.body.orders.delivered, 4); assert.ok(ov.body.money.ledgerBalanced); assert.ok(ov.body.money.revenue > 0);
    assert.equal((await call('GET', '/api/orders/9999/track')).status, 404);
    assert.equal((await call('GET', '/api/confirm/not-a-token')).status, 404);
  } finally { srv.close(); }
});
test('API driver login: only admins add drivers, the old id header is refused, logout ends the session', async () => {
  const { srv, call } = await boot();
  try {
    assert.equal((await call('POST', '/api/drivers', { name: 'X', vehicle: 'car', phone: '0831111111' })).status, 401);
    const H = await driverLogin(call, '0821234567');
    assert.equal((await call('GET', '/api/driver/me', null, { 'x-driver-id': '1' })).status, 401);
    assert.equal((await call('GET', '/api/driver/me', null, { authorization: 'Bearer made-up' })).status, 401);
    assert.equal((await call('POST', '/api/auth/verify', { phone: '0821234567', code: '12' })).status, 400);
    assert.equal((await call('GET', '/api/driver/me', null, H)).status, 200);
    assert.equal((await call('POST', '/api/auth/logout', {}, H)).status, 200);
    assert.equal((await call('GET', '/api/driver/me', null, H)).status, 401);
    const unknown = await call('POST', '/api/auth/otp', { phone: '0839999999' });
    assert.equal(unknown.status, 200); assert.equal(unknown.body.devCode, null);
  } finally { srv.close(); }
});
test('API login codes are never shown unless test mode is switched on, and never in production', async () => {
  const { srv, call } = await boot(), saved = { ...process.env };
  try {
    await call('POST', '/api/drivers', { name: 'T', vehicle: 'car', phone: '0821234567' }, ADMIN);
    delete process.env.OTP_DEV_CODES;
    let r = await call('POST', '/api/auth/otp', { phone: '0821234567' }); assert.equal(r.status, 503); assert.equal(r.body.devCode, undefined);
    process.env.OTP_DEV_CODES = '1'; process.env.NODE_ENV = 'production';
    r = await call('POST', '/api/auth/otp', { phone: '0821234567' }); assert.equal(r.status, 503); assert.equal(r.body.devCode, undefined);
  } finally { process.env.OTP_DEV_CODES = saved.OTP_DEV_CODES; if (saved.NODE_ENV === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = saved.NODE_ENV; srv.close(); }
});
test('API a login from another region is refused', async () => {
  const { srv, call, db } = await boot();
  try {
    const id = (await call('POST', '/api/drivers', { name: 'T', vehicle: 'car', phone: '0821234567' }, ADMIN)).body.id, { token, hash } = C.newToken();
    db.prepare('INSERT INTO sessions (token_hash,driver_id,region_id,created_at,expires_at) VALUES (?,?,?,?,?)').run(hash, id, 'other-region', clock.now(), clock.now() + 60_000);
    assert.equal((await call('GET', '/api/driver/me', null, { authorization: 'Bearer ' + token })).status, 403);
  } finally { srv.close(); }
});
test('static pages are served and path traversal is blocked', async () => {
  const { srv } = await boot(); const base = `http://127.0.0.1:${srv.address().port}`;
  try { assert.equal((await fetch(base + '/../package.json')).status, 404); assert.equal((await fetch(base + '/%2e%2e/package.json')).status, 404); } finally { srv.close(); }
});
