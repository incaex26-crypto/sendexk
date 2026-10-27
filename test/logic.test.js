const test = require('node:test'), assert = require('node:assert/strict');
const SM = require('../src/statemachine'), geo = require('../src/geo'), hot = require('../src/hotspots'), ETA = require('../src/eta'), C = require('../src/confirm'), L = require('../src/ledger');
const { open } = require('../src/db'), batching = require('../src/batching'), { setup, P: pts } = require('./helpers');
const { region } = setup();

test('state machine blocks illegal jumps', () => {
  assert.equal(SM.canMove('confirmed', 'delivered'), false);
  assert.equal(SM.canMove('awaiting_confirmation', 'batched'), false);
  assert.equal(SM.canMove('out_for_delivery', 'delivered'), true);
  assert.throws(() => SM.assertMove('delivered', 'confirmed'));
});
test('haversine Sandton-Rosebank is about 4.5 km', () => {
  const d = geo.haversineKm(pts.sandton, pts.rosebank); assert.ok(d > 4 && d < 5, d);
});
test('nearest-neighbour visits the closest point first', () => {
  const o = geo.sequence(pts.sandton, [pts.midrand, pts.bryanston, pts.rosebank]);
  assert.deepEqual(o[0], pts.rosebank);
});
test('nearestZone finds Sandton for a Sandton point', () => assert.equal(geo.nearestZone(region, pts.sandton).zone.id, 'SND'));
test('service area excludes far points', () => assert.equal(geo.inService(region, { lat: -33.9, lng: 18.4 }), false));
test('confirmation tokens are random and only hashed forms match', () => {
  const a = C.newToken(), b = C.newToken(); assert.notEqual(a.token, b.token); assert.equal(C.hash(a.token), a.hash); assert.notEqual(a.hash, a.token);
});
test('hotspots: demand without drivers scores high, covered cells score low', () => {
  const dem = Array.from({ length: 8 }, () => ({ ...pts.sandton, w: 1 }));
  const empty = hot.compute(region, { demandPoints: dem, driverPoints: [], alpha: 1 });
  const covered = hot.compute(region, { demandPoints: dem, driverPoints: [pts.sandton, pts.sandton, pts.sandton], alpha: 1 });
  assert.ok(empty[0].score >= 8); assert.equal(covered.length, 0);
});
test('hotspot bonus is capped by the daily budget', () => {
  const list = [{ cell: geo.cellOf(region, pts.sandton), score: 10 }];
  assert.ok(hot.bonusFor(region, list, pts.sandton, 0) > 0);
  assert.equal(hot.bonusFor(region, list, pts.sandton, region.hotspots.dailyBonusCap * 100), 0);
});
test('ETA window and notification threshold', () => {
  const w = ETA.window(0, 30); assert.equal(w.to - w.from, 40 * 60000);
  assert.equal(ETA.shouldNotify(1000, 1000 + 10 * 60000), false); assert.equal(ETA.shouldNotify(1000, 1000 + 45 * 60000), true);
});
test('ledger refuses unbalanced entries and stays at zero', () => {
  const db = open(':memory:');
  assert.throws(() => L.post(db, 'x', 'bad', 'r', [{ account: 'a', amount: 5 }, { account: 'b', amount: -4 }]));
  L.post(db, 'x', 'ok', 'r', [{ account: 'a', amount: 5 }, { account: 'b', amount: -5 }]); assert.equal(L.total(db), 0);
});
test('batching: holds an unprofitable lone parcel, publishes a worthwhile cluster', () => {
  const mk = (id, drop) => ({ id, zone: geo.nearestZone(region, drop).zone.id, outer: false, vehicleClass: 'car', weightKg: 2, pickup: pts.sandton, drop, capCents: 1e6 });
  const cluster = [0, 1, 2, 3, 4].map((i) => mk(i + 1, { lat: pts.rosebank.lat + i * 0.003, lng: pts.rosebank.lng }));
  const { runs } = batching.build(region, cluster); assert.equal(runs.length, 1); assert.equal(runs[0].parcels.length, 5);
  const lone = batching.build(region, [{ ...mk(9, pts.midrand), outer: true, capCents: 1800 }]);
  assert.equal(lone.runs.length, 0); assert.equal(lone.held.length, 1);
});
test('batching splits by stop limit', () => {
  const many = Array.from({ length: 30 }, (_, i) => ({ id: i + 1, zone: 'RSB', outer: false, vehicleClass: 'bike', weightKg: 1, pickup: pts.sandton, drop: { lat: pts.rosebank.lat + i * 0.0005, lng: pts.rosebank.lng }, capCents: 1e6 }));
  const { runs } = batching.build(region, many); assert.ok(runs.length >= 3); runs.forEach((r) => assert.ok(r.parcels.length <= 9, r.parcels.length));
});
