const test = require('node:test'), assert = require('node:assert/strict');
const { createApp } = require('../server'), { setup, P: pts } = require('./helpers'), S = require('../src/service');

async function boot() {
  const { db, region } = setup(); const srv = createApp({ db, regions: { [region.id]: region } });
  await new Promise((r) => srv.listen(0, r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const call = async (m, p, body, headers = {}) => { const r = await fetch(base + p, { method: m, headers: { 'content-type': 'application/json', ...headers }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, body: await r.json().catch(() => null) }; };
  return { srv, call, db, region };
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
    const drv = (await call('POST', '/api/drivers', { name: 'T', vehicle: 'car_ev' })).body.id, H = { 'x-driver-id': String(drv) };
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
test('static pages are served and path traversal is blocked', async () => {
  const { srv } = await boot(); const base = `http://127.0.0.1:${srv.address().port}`;
  try { assert.equal((await fetch(base + '/../package.json')).status, 404); assert.equal((await fetch(base + '/%2e%2e/package.json')).status, 404); } finally { srv.close(); }
});
