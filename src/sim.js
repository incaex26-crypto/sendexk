// Seeded full-day simulator. Same service functions the API uses, so it exercises the real rules.
const S = require('./service');
const P = require('./pricing');
const geo = require('./geo');
const clock = require('./clock');
const L = require('./ledger');

function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
const jitter = (r, p, km) => ({ lat: p.lat + ((r() - 0.5) * 2 * km) / 111.2, lng: p.lng + ((r() - 0.5) * 2 * km) / (111.2 * Math.cos((p.lat * Math.PI) / 180)) });
const atLocal = (date, hhmm, offsetH = 2) => { const [h, m] = hhmm.split(':').map(Number); return Date.parse(`${date}T00:00:00Z`) + ((h - offsetH) * 60 + m) * 60000; };

const FLEET = [['Thabo', 'car_ev'], ['Lerato', 'car'], ['Sipho', 'motorbike'], ['Naledi', 'motorbike_ev'], ['Pieter', 'car'], ['Ayesha', 'motorbike'],
  ['Kagiso', 'car_ev'], ['Zinhle', 'motorbike_ev'], ['Johan', 'van'], ['Mpho', 'car'], ['Bongani', 'motorbike'], ['Lindiwe', 'car']];

/** Create businesses and drivers, drivers scattered with a deliberate oversupply in Sandton. */
function populate(db, region, seed = 7) {
  const r = rng(seed), date = S.today(region);
  const shops = ['Zinc Bakery', 'Urban Threads', 'Kasi Kicks', 'Green Pharmacy Online', 'Bloom Florist', 'Nuts & Bolts', 'Book Nook', 'Glow Cosmetics']
    .map((name, i) => { const z = region.zones[i % 4]; const loc = jitter(r, z, 0.8); return { id: S.createAccount(db, region, { kind: 'business', name, ...loc, address: `${name}, ${z.name}` }), name, loc, zone: z.id }; });
  const drivers = FLEET.map(([name, vehicle], i) => {
    const id = S.createDriver(db, region, { name, vehicle, phone: '07' + String(10000000 + i) });
    const home = i < 7 ? region.zones[0] : pick(r, region.zones.slice(1, 5)); // most start in Sandton
    const p = jitter(r, home, 1.2); S.setPin(db, region, id, p.lat, p.lng);
    if (i % 4 === 0) S.buyPro(db, region, id);
    return { id, name, vehicle, pos: p };
  });
  return { shops, drivers, date, r };
}

function bookOrders(db, region, world, n = 70) {
  const { shops, r } = world, orders = [], dayStart = world.date;
  for (let i = 0; i < n; i++) {
    clock.set(atLocal(dayStart, '07:30') + Math.floor(r() * 115) * 60000); // 07:30-09:25 local
    const shop = pick(r, shops), zone = r() < 0.04 ? region.zones[5] : pick(r, region.zones.slice(0, 5));
    const cls = r() < 0.55 ? 'bike' : r() < 0.9 ? 'car' : 'van', kg = cls === 'bike' ? 0.5 + r() * 4 : cls === 'car' ? 1 + r() * 20 : 20 + r() * 80;
    const drop = jitter(r, zone, 1.4);
    try {
      const { order } = S.createOrder(db, region, { accountId: shop.id, vehicleClass: cls, weightKg: Math.round(kg * 10) / 10, category: 'parcel', sender: { name: shop.name, phone: '0110000000' },
        recipient: { name: 'Customer ' + (i + 1), phone: '08' + String(30000000 + i) }, pickup: { ...shop.loc, address: shop.name }, drop: { ...drop, address: zone.name } });
      const paid = S.markPaid(db, region, order.id);
      orders.push({ id: order.id, token: paid.confirmToken, zone, drop });
    } catch (e) { if (e.status !== 422) throw e; }
  }
  return orders;
}

function confirmOrders(db, region, world, orders) {
  const { r } = world, res = { confirmed: 0, unavailable: 0, silent: 0 };
  for (const o of orders) {
    clock.set(atLocal(world.date, '09:30') + Math.floor(r() * 85) * 60000); // 09:30-10:55
    const x = r();
    if (x < 0.78) { const c = S.confirm(db, region, o.token, { available: true, lat: o.drop.lat, lng: o.drop.lng }); o.code = c.deliveryCode; res.confirmed++; }
    else if (x < 0.88) { S.confirm(db, region, o.token, { available: false }); res.unavailable++; }
    else res.silent++;
  }
  return res;
}

function runDay(db, region, { seed = 7, orders: n = 70 } = {}) {
  const world = populate(db, region, seed), t0 = Date.now();
  const orders = bookOrders(db, region, world, n);
  const conf = confirmOrders(db, region, world, orders);
  clock.set(atLocal(world.date, '11:00')); const sweep = S.sweepUnconfirmed(db, region);
  S.refreshHotspots(db, region); const hotspotsAtDispatch = S.currentHotspots(db, region).slice(0, 5);
  clock.set(atLocal(world.date, '11:30')); const dispatched = S.dispatch(db, region);
  const byCode = Object.fromEntries(orders.filter((o) => o.code).map((o) => [o.id, o.code]));

  // Drivers pick up work one after another until the deadline.
  const free = Object.fromEntries(world.drivers.map((d) => [d.id, atLocal(world.date, '11:30')]));
  const deadline = atLocal(world.date, region.cutoffs.deliveryDeadline), r = world.r;
  const stat = {}; world.drivers.forEach((d) => (stat[d.id] = { name: d.name, vehicle: d.vehicle, runs: 0, parcels: 0, km: 0, minutes: 0, earned: 0 }));
  let failures = 0, guard = 0;
  for (;;) {
    if (++guard > 500) break;
    const ready = world.drivers.filter((d) => free[d.id] < deadline).sort((a, b) => free[a.id] - free[b.id] || (S.driverTier(db.prepare('SELECT * FROM drivers WHERE id=?').get(b.id)) === 'pro') - (S.driverTier(db.prepare('SELECT * FROM drivers WHERE id=?').get(a.id)) === 'pro'));
    let took = false;
    for (const d of ready) {
      clock.set(free[d.id]);
      const opts = S.listOpenRuns(db, region, d.id).filter((v) => free[d.id] + v.minutes * 60000 <= deadline);
      if (!opts.length) { free[d.id] = deadline; continue; }
      const best = opts[0]; S.acceptRun(db, region, best.id, d.id);
      const parcels = db.prepare('SELECT * FROM orders WHERE run_id=? ORDER BY seq').all(best.id);
      for (const o of parcels) S.scan(db, region, o.id, d.id, 'collect', {});
      for (const o of parcels) {
        const row = db.prepare('SELECT * FROM orders WHERE id=?').get(o.id);
        S.scan(db, region, o.id, d.id, 'out', { lat: best.route[0].lat, lng: best.route[0].lng });
        if (r() < 0.06) { failures++; S.scan(db, region, o.id, d.id, 'fail', { reason: 'recipient unreachable' }); S.scan(db, region, o.id, d.id, 'return', {}); }
        else S.scan(db, region, o.id, d.id, 'deliver', { code: byCode[o.id], lat: row.drop_lat, lng: row.drop_lng });
      }
      const mins = best.minutes + 12; free[d.id] += mins * 60000;
      const s = stat[d.id]; s.runs++; s.parcels += parcels.length; s.km += best.km; s.minutes += mins; s.earned += best.payoutCents;
      const last = parcels[parcels.length - 1]; S.ping(db, region, d.id, last.drop_lat, last.drop_lng);
      took = true; break;
    }
    if (!took) break;
  }
  clock.set(atLocal(world.date, '18:00')); const sweep2 = S.sweepUnconfirmed(db, region); const payouts = S.runPayouts(db, region);
  const ov = S.overview(db, region);
  const delivered = db.prepare("SELECT * FROM orders WHERE status='delivered'").all();
  const avgPrice = delivered.length ? delivered.reduce((a, o) => a + o.price_cents, 0) / delivered.length : 0;
  const avgCap = delivered.length ? delivered.reduce((a, o) => a + o.cap_cents, 0) / delivered.length : 0;
  const fleet = Object.values(stat).filter((s) => s.runs);
  const group = (f) => { const g = fleet.filter(f); const h = g.reduce((a, s) => a + s.minutes, 0) / 60; return { drivers: g.length, perHour: h ? Math.round(g.reduce((a, s) => a + s.earned, 0) / h) / 100 : 0 }; };
  const pro = new Set(db.prepare('SELECT name FROM drivers WHERE pro_until>0').all().map((x) => x.name));
  return {
    date: world.date, seconds: (Date.now() - t0) / 1000, booked: orders.length, confirmation: conf, sweep, sweepEvening: sweep2,
    runsPublished: dispatched.runs.length, parcelsHeld: dispatched.held.reduce((a, h) => a + h.orderIds.length, 0), heldReasons: [...new Set(dispatched.held.flatMap((h) => h.reasons))],
    parcelsPerRun: Math.round((dispatched.runs.reduce((a, r) => a + r.parcels.length, 0) / Math.max(1, dispatched.runs.length)) * 10) / 10,
    orders: ov.orders, runs: ov.runs, failures,
    pricing: { avgPaidPerParcel: Math.round(avgPrice) / 100, avgSoloCap: Math.round(avgCap) / 100, savingVsSolo: avgCap ? Math.round((1 - avgPrice / avgCap) * 100) : 0 },
    money: { platformRevenueR: ov.money.revenue / 100, refundsDueR: ov.money.refundsDue / 100, driverPayoutsR: payouts.reduce((a, p) => a + p.paid + p.held, 0) / 100, ledgerBalanced: ov.money.ledgerBalanced },
    driverPerHourR: { electric: group((s) => s.vehicle.endsWith('_ev')), petrol: group((s) => !s.vehicle.endsWith('_ev')), pro: group((s) => pro.has(s.name)), standard: group((s) => !pro.has(s.name)) },
    hotspots: hotspotsAtDispatch.map((h) => ({ cell: h.cell, score: h.score, lat: +h.lat.toFixed(4), lng: +h.lng.toFixed(4) })),
    drivers: Object.values(stat).map((s) => ({ ...s, km: Math.round(s.km), earnedR: s.earned / 100 })),
  };
}

module.exports = { runDay, populate, bookOrders, confirmOrders, rng, atLocal };
