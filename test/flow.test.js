const test = require('node:test'), assert = require('node:assert/strict');
const S = require('../src/service'), L = require('../src/ledger'), clock = require('../src/clock'), { setup, order, P: pts } = require('./helpers');

function flowSetup() {
  const { db, region } = setup('2026-10-26T06:30:00Z'); // 08:30 local
  const orders = [];
  for (let i = 0; i < 5; i++) {
    const { order: o } = order(S, db, region); const paid = S.markPaid(db, region, o.id, o.cap_cents);
    const c = S.confirm(db, region, paid.confirmToken, { available: true, lat: pts.rosebank.lat + i * 0.003, lng: pts.rosebank.lng });
    orders.push({ id: o.id, token: paid.confirmToken, code: c.deliveryCode });
  }
  return { db, region, orders };
}

test('full happy path: book -> pay -> confirm -> batch -> accept -> deliver -> payout, ledger balanced', () => {
  const { db, region, orders } = flowSetup();
  const driver = S.createDriver(db, region, { name: 'Thabo', phone: '0820000001', vehicle: 'car_ev' });
  const d = S.dispatch(db, region); assert.equal(d.runs.length, 1);
  const open = S.listOpenRuns(db, region, driver); assert.equal(open.length, 1);
  const acc = S.acceptRun(db, region, open[0].id, driver);
  for (const o of orders) {
    S.scan(db, region, o.id, driver, 'collect', pts.sandton);
    S.scan(db, region, o.id, driver, 'out', pts.sandton);
    const r = S.scan(db, region, o.id, driver, 'deliver', { code: o.code, ...pts.rosebank });
    assert.equal(r.order.status, 'delivered');
  }
  assert.equal(S.overview(db, region).runs.completed, 1);
  assert.ok(S.overview(db, region).money.ledgerBalanced);
  const pay = S.runPayouts(db, region); assert.equal(pay.length, 1); assert.ok(pay[0].paid > 0);
  assert.equal(L.total(db), 0);
});

test('two drivers cannot accept the same run', () => {
  const { db, region } = flowSetup();
  const a = S.createDriver(db, region, { name: 'A', vehicle: 'car' }), b = S.createDriver(db, region, { name: 'B', vehicle: 'car_ev' });
  const run = S.dispatch(db, region).runs[0];
  S.acceptRun(db, region, run.id, a);
  assert.throws(() => S.acceptRun(db, region, run.id, b), /already taken|wrong/);
});
test('motorbike driver cannot take a car run', () => {
  const { db, region } = flowSetup(); const m = S.createDriver(db, region, { name: 'M', vehicle: 'motorbike' });
  const run = S.dispatch(db, region).runs[0];
  assert.throws(() => S.acceptRun(db, region, run.id, m), /wrong vehicle class/);
});
test('wrong delivery code is refused and attempts are limited', () => {
  const { db, region, orders } = flowSetup(); const d = S.createDriver(db, region, { name: 'D', vehicle: 'car' });
  S.acceptRun(db, region, S.dispatch(db, region).runs[0].id, d);
  const o = orders[0]; S.scan(db, region, o.id, d, 'collect', {}); S.scan(db, region, o.id, d, 'out', pts.sandton);
  for (let i = 0; i < 5; i++) assert.equal(S.scan(db, region, o.id, d, 'deliver', { code: '0000x' }).status, 403);
  assert.throws(() => S.scan(db, region, o.id, d, 'deliver', { code: o.code }), /too many/);
});
test('unconfirmed parcels are never dispatched and roll to the next day', () => {
  const { db, region } = setup(); const { order: o } = order(S, db, region); S.markPaid(db, region, o.id);
  assert.equal(S.dispatch(db, region).runs.length, 0);
  clock.set(Date.parse('2026-10-26T09:05:00Z')); // 11:05 local, past confirmation cutoff
  assert.deepEqual(S.sweepUnconfirmed(db, region), { rolled: 1, expired: 0 });
  assert.equal(S.getOrder(db, o.id).service_date, '2026-10-27');
});
test('unconfirmed parcels expire after 3 days with a refund recorded', () => {
  const { db, region } = setup(); const { order: o } = order(S, db, region); S.markPaid(db, region, o.id);
  clock.set(Date.parse('2026-10-29T09:00:00Z')); S.sweepUnconfirmed(db, region);
  assert.equal(S.getOrder(db, o.id).status, 'expired');
  assert.equal(-L.balance(db, 'refund_due'), o.cap_cents);
});
test('booking after the cutoff moves service to the next day', () => {
  const { db, region } = setup('2026-10-26T08:00:00Z'); // 10:00 local
  assert.equal(order(S, db, region).order.service_date, '2026-10-27');
});
test('idempotent order creation returns the same order', () => {
  const { db, region } = setup(); const a = order(S, db, region, {}), key = 'k-1';
  const x = S.createOrder(db, region, { vehicleClass: 'car', sender: { name: 'a', phone: '1' }, recipient: { name: 'b', phone: '2' }, pickup: pts.sandton, drop: pts.rosebank }, key);
  const y = S.createOrder(db, region, { vehicleClass: 'car', sender: { name: 'a', phone: '1' }, recipient: { name: 'b', phone: '2' }, pickup: pts.sandton, drop: pts.rosebank }, key);
  assert.equal(x.order.id, y.order.id); assert.equal(y.replay, true);
});
test('banned categories, overweight and out-of-area are rejected', () => {
  const { db, region } = setup();
  assert.throws(() => order(S, db, region, { category: 'firearms' }), /not allowed/);
  assert.throws(() => order(S, db, region, { vehicleClass: 'bike', weightKg: 50 }), /too heavy/);
  assert.throws(() => order(S, db, region, { drop: { lat: -33.9, lng: 18.4 } }), /outside/);
});
test('failed delivery: same-day return to sender settles and closes the run', () => {
  const { db, region, orders } = flowSetup(); const d = S.createDriver(db, region, { name: 'D', vehicle: 'car' });
  S.acceptRun(db, region, S.dispatch(db, region).runs[0].id, d);
  for (const o of orders) { S.scan(db, region, o.id, d, 'collect', {}); S.scan(db, region, o.id, d, 'out', pts.sandton); }
  for (const o of orders.slice(1)) S.scan(db, region, o.id, d, 'deliver', { code: o.code });
  S.scan(db, region, orders[0].id, d, 'fail', { reason: 'no answer' }); assert.equal(S.overview(db, region).runs.accepted, 1);
  S.scan(db, region, orders[0].id, d, 'return', {});
  assert.equal(S.overview(db, region).runs.completed, 1); assert.ok(S.overview(db, region).money.ledgerBalanced);
});
test('pro pass lowers the platform share on later runs', () => {
  const { db, region } = flowSetup(); const a = S.createDriver(db, region, { name: 'A', vehicle: 'car' }), b = S.createDriver(db, region, { name: 'B', vehicle: 'car' });
  S.buyPro(db, region, b); assert.equal(S.driverTier(db.prepare('SELECT * FROM drivers WHERE id=?').get(b)), 'pro');
  S.dispatch(db, region);
  assert.ok(S.listOpenRuns(db, region, b)[0].payoutCents >= S.listOpenRuns(db, region, a)[0].payoutCents);
});
test('hotspot bonus appears for a driver when a hot cell has demand and no drivers', () => {
  const { db, region } = flowSetup(); S.refreshHotspots(db, region);
  assert.ok(S.currentHotspots(db, region).length > 0);
});
