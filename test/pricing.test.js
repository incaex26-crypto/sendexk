const test = require('node:test'), assert = require('node:assert/strict');
const P = require('../src/pricing'), { setup, P: pts } = require('./helpers');
const { region } = setup();

test('petrol car energy cost = L/100km x price', () => {
  assert.equal(P.energyCostCents(region, 'car', 100), 7 * 25 * 100); // 7L x R25 = R175
});
test('electric car energy cost uses kWh price', () => {
  assert.equal(P.energyCostCents(region, 'car_ev', 100), 16 * 3 * 100);
});
test('EV is cheaper to run than petrol on the same route', () => {
  const route = [pts.sandton, pts.rosebank, pts.bryanston];
  const parcels = [{ capCents: 1e6 }, { capCents: 1e6 }, { capCents: 1e6 }];
  const petrol = P.evaluateRun(region, 'car', route, parcels), ev = P.evaluateRun(region, 'car_ev', route, parcels);
  assert.ok(ev.cost.energy < petrol.cost.energy);
  assert.ok(ev.revenue <= petrol.revenue);
});
test('price per parcel falls as the run fills up', () => {
  const route = (n) => [pts.sandton, ...Array.from({ length: n }, (_, i) => ({ lat: pts.rosebank.lat + i * 0.002, lng: pts.rosebank.lng }))];
  const per = (n) => { const e = P.evaluateRun(region, 'car', route(n), Array.from({ length: n }, () => ({ capCents: 1e6 }))); return e.revenue / n; };
  assert.ok(per(8) < per(2));
});
test('business never pays above cap', () => {
  const route = [pts.sandton, pts.midrand], e = P.evaluateRun(region, 'car', route, [{ capCents: 3000 }]);
  assert.ok(e.prices[0] <= 3000);
});
test('payout never below driver cost', () => {
  const e = P.evaluateRun(region, 'car', [pts.sandton, pts.rosebank, pts.randburg], [{ capCents: 1e6 }, { capCents: 1e6 }]);
  assert.ok(e.payout >= e.cost.total);
});
test('pro tier gives driver more money than standard on the same run', () => {
  const route = [pts.sandton, pts.rosebank, pts.bryanston, pts.randburg], pc = Array(3).fill({ capCents: 1e6 });
  assert.ok(P.evaluateRun(region, 'car', route, pc, 'pro').payout >= P.evaluateRun(region, 'car', route, pc, 'standard').payout);
});
test('EV range respects the 20% reserve', () => {
  assert.equal(P.withinRange(region, 'car_ev', 220), true);
  assert.equal(P.withinRange(region, 'car_ev', 230), false);
  assert.equal(P.withinRange(region, 'car', 5000), true);
});
test('quote cap >= low and class order bike < car < van', () => {
  const q = (c) => P.quote(region, { pickup: pts.sandton, drop: pts.rosebank, vehicleClass: c });
  assert.ok(q('bike').cap < q('car').cap && q('car').cap < q('van').cap);
  assert.ok(q('car').low <= q('car').cap);
});
