// Domain operations. Everything that changes state goes through here, inside a transaction,
// and writes an event. The HTTP layer and the simulator both call these same functions.
const fs = require('node:fs');
const path = require('node:path');
const clock = require('./clock');
const { tx } = require('./db');
const geo = require('./geo');
const P = require('./pricing');
const SM = require('./statemachine');
const L = require('./ledger');
const C = require('./confirm');
const batching = require('./batching');
const hot = require('./hotspots');
const ETA = require('./eta');
const N = require('./notify');

const DAY = 86400000;
const err = (status, message) => Object.assign(new Error(message), { status });

// ---------- regions ----------
function loadRegions(db, dir = path.join(__dirname, '..', 'config', 'regions')) {
  const regions = {};
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json'))) {
    const cfg = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    regions[cfg.id] = cfg;
    db.prepare('INSERT INTO regions (id,name,status,config) VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,status=excluded.status,config=excluded.config')
      .run(cfg.id, cfg.name, cfg.status, JSON.stringify(cfg));
  }
  return regions;
}

// ---------- time helpers (region-local) ----------
function localParts(ms, tz) {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  const o = Object.fromEntries(f.formatToParts(ms).map((p) => [p.type, p.value]));
  return { date: `${o.year}-${o.month}-${o.day}`, minutes: Number(o.hour) * 60 + Number(o.minute) };
}
const hm = (s) => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
const addDays = (date, n) => new Date(Date.parse(date + 'T12:00:00Z') + n * DAY).toISOString().slice(0, 10);
const today = (region) => localParts(clock.now(), region.timezone).date;

// ---------- events ----------
function log(db, region_id, entity, entity_id, type, actor, data) {
  db.prepare('INSERT INTO events (at, region_id, entity, entity_id, type, actor, data) VALUES (?,?,?,?,?,?,?)')
    .run(clock.now(), region_id, entity, entity_id, type, actor || 'system', data ? JSON.stringify(data) : null);
}
const getOrder = (db, id) => { const o = db.prepare('SELECT * FROM orders WHERE id=?').get(id); if (!o) throw err(404, 'order not found'); return o; };

function moveOrder(db, o, to, fields = {}, actor, type) {
  SM.assertMove(o.status, to);
  const keys = Object.keys(fields), sets = ['status=?', 'version=version+1', 'updated_at=?', ...keys.map((k) => `${k}=?`)];
  const r = db.prepare(`UPDATE orders SET ${sets.join(',')} WHERE id=? AND version=?`).run(to, clock.now(), ...keys.map((k) => fields[k]), o.id, o.version);
  if (r.changes !== 1) throw err(409, 'order changed under you, retry');
  log(db, o.region_id, 'order', o.id, type || to, actor, { from: o.status, to, ...fields });
  return getOrder(db, o.id);
}

// ---------- accounts & drivers ----------
function createAccount(db, region, { kind = 'business', name, phone, email, lat, lng, address }) {
  if (!name) throw err(400, 'name required');
  const r = db.prepare('INSERT INTO accounts (region_id,kind,name,phone,email,lat,lng,address,created_at) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(region.id, kind, name, phone || null, email || null, lat ?? null, lng ?? null, address || null, clock.now());
  return Number(r.lastInsertRowid);
}
function createDriver(db, region, { name, phone, vehicle }) {
  if (!region.vehicles[vehicle]) throw err(400, `unknown vehicle ${vehicle}`);
  const r = db.prepare('INSERT INTO drivers (region_id,name,phone,vehicle,created_at) VALUES (?,?,?,?,?)').run(region.id, name, phone || null, vehicle, clock.now());
  return Number(r.lastInsertRowid);
}
const driverTier = (d) => (d.pro_until > clock.now() ? 'pro' : 'standard');

function buyPro(db, region, driverId) {
  return tx(db, () => {
    const d = db.prepare('SELECT * FROM drivers WHERE id=?').get(driverId); if (!d) throw err(404, 'driver not found');
    const price = P.cents(region.pricing.proPassPrice);
    const from = Math.max(clock.now(), d.pro_until);
    db.prepare('UPDATE drivers SET pro_until=? WHERE id=?').run(from + 30 * DAY, driverId);
    L.post(db, region.id, 'pro pass', `driver:${driverId}`, [{ account: 'bank', amount: price }, { account: 'platform_revenue', amount: -price }]);
    log(db, region.id, 'driver', driverId, 'pro_pass_bought', `driver:${driverId}`, { until: from + 30 * DAY });
    return { pro_until: from + 30 * DAY };
  });
}

// ---------- quote & orders ----------
function zoneInfo(region, p) {
  const { zone } = geo.nearestZone(region, p);
  return { zone: zone.id, outer: !!zone.outer };
}

function quote(region, body) {
  const pickup = point(body.pickup), drop = point(body.drop);
  if (!geo.inService(region, pickup) || !geo.inService(region, drop)) throw err(422, 'outside service area');
  if (!['bike', 'car', 'van'].includes(body.vehicleClass)) throw err(400, 'vehicleClass must be bike, car or van');
  const z = zoneInfo(region, drop);
  const q = P.quote(region, { pickup, drop, vehicleClass: body.vehicleClass, outer: z.outer });
  return { ...q, zone: z.zone, outer: z.outer, serviceDate: serviceDateFor(region), note: 'Business pays the actual price, never above cap. Individuals pay the cap and get the difference refunded.' };
}
function point(p) { if (!p || typeof p.lat !== 'number' || typeof p.lng !== 'number') throw err(400, 'lat/lng required'); return { lat: p.lat, lng: p.lng }; }

function serviceDateFor(region) {
  const t = localParts(clock.now(), region.timezone);
  return t.minutes >= hm(region.cutoffs.booking) ? addDays(t.date, 1) : t.date;
}

function createOrder(db, region, body, idemKey) {
  if (idemKey) { const ex = db.prepare('SELECT * FROM orders WHERE idem_key=?').get(idemKey); if (ex) return { order: ex, replay: true }; }
  const r = region.rules;
  const q = quote(region, body);
  if (r.bannedCategories.includes(body.category)) throw err(422, `category ${body.category} is not allowed`);
  const declared = P.cents(body.declaredValue || 0);
  if (declared > P.cents(r.maxDeclaredValue)) throw err(422, `declared value above R${r.maxDeclaredValue}`);
  const kg = Number(body.weightKg || 1);
  const ref = region.vehicles[P.referenceVehicle(body.vehicleClass)];
  if (kg > ref.maxKg) throw err(422, `too heavy for ${body.vehicleClass}`);
  for (const k of ['recipient', 'sender']) if (!body[k]?.name || !body[k]?.phone) throw err(400, `${k}.name and ${k}.phone required`);
  return tx(db, () => {
    const res = db.prepare(`INSERT INTO orders (region_id,account_id,idem_key,status,service_date,vehicle_class,weight_kg,category,declared_cents,
      pickup_name,pickup_phone,pickup_addr,pickup_lat,pickup_lng,drop_name,drop_phone,drop_addr,drop_lat,drop_lng,drop_zone,drop_outer,cap_cents,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      region.id, body.accountId || null, idemKey || null, 'awaiting_payment', q.serviceDate, body.vehicleClass, kg, body.category || 'general', declared,
      body.sender.name, body.sender.phone, body.pickup.address || null, body.pickup.lat, body.pickup.lng,
      body.recipient.name, body.recipient.phone, body.drop.address || null, body.drop.lat, body.drop.lng, q.zone, q.outer ? 1 : 0, q.cap, clock.now(), clock.now());
    const id = Number(res.lastInsertRowid);
    log(db, region.id, 'order', id, 'created', 'api', { cap: q.cap, serviceDate: q.serviceDate });
    return { order: getOrder(db, id), quote: q, replay: false };
  });
}

/** Mock payment. In production this is the Paystack/PayFast webhook handler (verify signature first). */
function markPaid(db, region, orderId, amountCents) {
  return tx(db, () => {
    const o = getOrder(db, orderId);
    if (o.status !== 'awaiting_payment') throw err(409, `order is ${o.status}`);
    if (amountCents !== undefined && amountCents < o.cap_cents) throw err(402, 'amount below cap');
    L.payIn(db, region.id, o.id, o.account_id, o.cap_cents);
    const t = C.newToken();
    const upd = moveOrder(db, o, 'awaiting_confirmation', { token_hash: t.hash, token_expires: clock.now() + region.rules.confirmationExpiryDays * DAY }, 'payment', 'paid');
    tell(db, upd, 'payment_received');
    tell(db, upd, 'booking_confirmed');
    return { order: upd, confirmToken: t.token }; // token is texted to the recipient, never stored in clear
  });
}

// ---------- recipient confirmation ----------
function orderByToken(db, token) {
  const o = db.prepare('SELECT * FROM orders WHERE token_hash=?').get(C.hash(token || ''));
  if (!o) throw err(404, 'link not valid');
  if (o.token_expires < clock.now()) throw err(410, 'link expired');
  return o;
}
function previewConfirm(db, region, token) {
  const o = orderByToken(db, token);
  return { id: o.id, status: o.status, from: o.pickup_name, to: o.drop_name, address: o.drop_addr, lat: o.drop_lat, lng: o.drop_lng,
    serviceDate: o.service_date, region: { center: region.center, name: region.name, brand: region.brand.name }, confirmed: !!o.drop_confirmed };
}
/** body: { available: bool, lat, lng } . The recipient's pin overrides the address geocode. */
function confirm(db, region, token, body) {
  return tx(db, () => {
    const o = orderByToken(db, token);
    if (!['awaiting_confirmation', 'confirmed'].includes(o.status)) throw err(409, `order is ${o.status}`);
    if (body.available === false) {
      const date = addDays(o.service_date, 1);
      if (addDays(o.created_at ? localParts(o.created_at, region.timezone).date : date, region.rules.confirmationExpiryDays) < date) return { order: expireOrder(db, region, o, 'recipient never available'), rolled: false };
      return { order: moveOrderSafe(db, o, { service_date: date }, 'recipient', 'rolled', 'awaiting_confirmation'), rolled: true, serviceDate: date };
    }
    const pin = point(body);
    if (!geo.inService(region, pin)) throw err(422, 'pin is outside the service area');
    const z = zoneInfo(region, pin), code = C.newCode();
    const upd = moveOrder(db, o, 'confirmed', { drop_lat: pin.lat, drop_lng: pin.lng, drop_zone: z.zone, drop_outer: z.outer ? 1 : 0, drop_confirmed: 1, code_hash: C.hash(code), code_attempts: 0 }, 'recipient', 'confirmed');
    return { order: upd, deliveryCode: code, serviceDate: upd.service_date };
  });
}
function moveOrderSafe(db, o, fields, actor, type, status) {
  if (o.status === status) { // same status: just update fields
    const keys = Object.keys(fields);
    db.prepare(`UPDATE orders SET ${keys.map((k) => k + '=?').join(',')}, version=version+1, updated_at=? WHERE id=? AND version=?`).run(...keys.map((k) => fields[k]), clock.now(), o.id, o.version);
    log(db, o.region_id, 'order', o.id, type, actor, fields); return getOrder(db, o.id);
  }
  return moveOrder(db, o, status, fields, actor, type);
}
function expireOrder(db, region, o, why) {
  const upd = moveOrder(db, o, 'expired', {}, 'system', 'expired');
  const paid = db.prepare("SELECT COALESCE(SUM(-amount_cents),0) AS b FROM ledger WHERE account=?").get(`escrow:order:${o.id}`).b;
  if (paid > 0) L.post(db, region.id, 'refund on expiry', `order:${o.id}`, [{ account: `escrow:order:${o.id}`, amount: paid }, { account: 'refund_due', amount: -paid }]);
  log(db, region.id, 'order', o.id, 'refund_due', 'system', { cents: paid, why });
  return upd;
}

/** Run at the confirmation cut-off: unconfirmed parcels roll to the next day, old ones expire. */
function sweepUnconfirmed(db, region) {
  const t = localParts(clock.now(), region.timezone), out = { rolled: 0, expired: 0 };
  return tx(db, () => {
    const rows = db.prepare("SELECT * FROM orders WHERE region_id=? AND status='awaiting_confirmation' AND service_date<=?").all(region.id, t.date);
    for (const o of rows) {
      if (o.token_expires < clock.now() || addDays(localParts(o.created_at, region.timezone).date, region.rules.confirmationExpiryDays) < addDays(t.date, 1)) { expireOrder(db, region, o, 'no confirmation'); out.expired++; }
      else { moveOrderSafe(db, o, { service_date: addDays(t.date, 1) }, 'system', 'rolled', 'awaiting_confirmation'); out.rolled++; }
    }
    return out;
  });
}

// ---------- batching & runs ----------
const toParcel = (o) => ({ id: o.id, zone: o.drop_zone, outer: !!o.drop_outer, vehicleClass: o.vehicle_class, weightKg: o.weight_kg,
  pickup: { lat: o.pickup_lat, lng: o.pickup_lng }, drop: { lat: o.drop_lat, lng: o.drop_lng }, capCents: o.cap_cents });

function dispatch(db, region, date = today(region)) {
  return tx(db, () => {
    const rows = db.prepare("SELECT * FROM orders WHERE region_id=? AND status='confirmed' AND service_date<=? AND drop_confirmed=1").all(region.id, date);
    const { runs, held } = batching.build(region, rows.map(toParcel));
    const created = [];
    for (const r of runs) {
      const res = db.prepare(`INSERT INTO runs (region_id,service_date,vehicle_class,status,km,minutes,revenue_cents,payout_cents,take_cents,route,created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(region.id, date, r.vehicleClass, 'open', r.km, r.minutes, r.revenue, r.payout, r.take, JSON.stringify({ route: r.route, drops: r.drops, pickups: r.pickups }), clock.now());
      const runId = Number(res.lastInsertRowid);
      r.drops.forEach((oid, i) => { moveOrder(db, getOrder(db, oid), 'batched', { run_id: runId, seq: i + 1 }, 'dispatch', 'batched'); });
      log(db, region.id, 'run', runId, 'published', 'dispatch', { parcels: r.parcels.length, km: r.km, take: r.take });
      created.push({ ...r, id: runId });
    }
    for (const h of held) for (const p of h.parcels) log(db, region.id, 'order', p.id, 'held', 'dispatch', { reasons: h.reasons });
    return { runs: created, held: held.map((h) => ({ orderIds: h.parcels.map((p) => p.id), reasons: h.reasons })) };
  });
}

function runView(db, region, run, driver) {
  const parcels = db.prepare('SELECT * FROM orders WHERE run_id=? ORDER BY seq').all(run.id).map(toParcel);
  const meta = JSON.parse(run.route);
  const tier = driver ? driverTier(driver) : 'standard';
  const vehicle = driver ? driver.vehicle : P.referenceVehicle(run.vehicle_class);
  const ev = P.evaluateRun(region, vehicle, meta.route, parcels, tier);
  const bonus = driver ? hot.bonusFor(region, currentHotspots(db, region), meta.route[0], bonusSpent(db, region)) : 0;
  return { id: run.id, status: run.status, vehicleClass: run.vehicle_class, parcels: parcels.length, km: ev.km, minutes: ev.minutes,
    payoutCents: ev.payout + bonus, bonusCents: bonus, route: meta.route, drops: meta.drops, rangeOk: P.withinRange(region, vehicle, ev.km), tier, eval: ev };
}

function listOpenRuns(db, region, driverId) {
  const d = db.prepare('SELECT * FROM drivers WHERE id=?').get(driverId); if (!d) throw err(404, 'driver not found');
  const cls = P.vehicleClass(d.vehicle);
  const rows = db.prepare("SELECT * FROM runs WHERE region_id=? AND status='open' AND vehicle_class=? ORDER BY id").all(region.id, cls);
  const views = rows.map((r) => runView(db, region, r, d)).filter((v) => v.rangeOk);
  // Pro drivers see new runs first: they get a head start before standard drivers (enforced by `earliestVisible`).
  return views.sort((a, b) => b.payoutCents - a.payoutCents);
}

function acceptRun(db, region, runId, driverId) {
  return tx(db, () => {
    const d = db.prepare('SELECT * FROM drivers WHERE id=?').get(driverId); if (!d) throw err(404, 'driver not found');
    const run = db.prepare('SELECT * FROM runs WHERE id=?').get(runId); if (!run) throw err(404, 'run not found');
    if (run.vehicle_class !== P.vehicleClass(d.vehicle)) throw err(422, 'wrong vehicle class');
    const view = runView(db, region, run, d);
    if (!view.rangeOk) throw err(422, 'run beyond vehicle range');
    // Atomic: only one driver can flip open -> accepted.
    const r = db.prepare("UPDATE runs SET status='accepted', driver_id=?, vehicle=?, accepted_at=?, version=version+1, km=?, minutes=?, payout_cents=?, bonus_cents=?, revenue_cents=?, take_cents=? WHERE id=? AND status='open'")
      .run(driverId, d.vehicle, clock.now(), view.km, view.minutes, view.eval.payout + view.bonusCents, view.bonusCents, view.eval.revenue, view.eval.take - view.bonusCents, runId);
    if (r.changes !== 1) throw err(409, 'run already taken');
    view.eval.prices.forEach((price, i) => db.prepare('UPDATE orders SET price_cents=? WHERE run_id=? AND seq=?').run(price, runId, i + 1));
    if (view.bonusCents) L.bonus(db, region.id, driverId, view.bonusCents, runId);
    db.prepare("UPDATE drivers SET status='on_run' WHERE id=?").run(driverId);
    log(db, region.id, 'run', runId, 'accepted', `driver:${driverId}`, { payout: view.payoutCents, bonus: view.bonusCents, tier: view.tier });
    for (const o of db.prepare('SELECT * FROM orders WHERE run_id=?').all(runId)) tell(db, o, 'driver_assigned');
    return { run: db.prepare('SELECT * FROM runs WHERE id=?').get(runId), view };
  });
}

/** Driver drops the run: parcels return to the pool (state machine: batched -> confirmed). */
function releaseRun(db, region, runId, driverId) {
  return tx(db, () => {
    const run = db.prepare('SELECT * FROM runs WHERE id=?').get(runId);
    if (!run || run.driver_id !== driverId || run.status !== 'accepted') throw err(409, 'cannot release');
    for (const o of db.prepare('SELECT * FROM orders WHERE run_id=?').all(runId)) moveOrder(db, o, 'confirmed', { run_id: null, seq: null, price_cents: null }, `driver:${driverId}`, 'returned_to_pool');
    db.prepare("UPDATE runs SET status='cancelled' WHERE id=?").run(runId);
    db.prepare("UPDATE drivers SET status='online' WHERE id=?").run(driverId);
    log(db, region.id, 'run', runId, 'released', `driver:${driverId}`);
  });
}

// ---------- scans ----------
function scan(db, region, orderId, driverId, action, body = {}) {
  return tx(db, () => {
    const o = getOrder(db, orderId), run = db.prepare('SELECT * FROM runs WHERE id=?').get(o.run_id);
    if (!run || run.driver_id !== driverId) throw err(403, 'not your parcel');
    const actor = `driver:${driverId}`, here = body.lat != null ? { lat: body.lat, lng: body.lng } : null;
    if (here) recordPing(db, region, driverId, here.lat, here.lng, true);
    let res;
    if (action === 'collect') res = { order: moveOrder(db, o, 'collected', {}, actor, 'collected') };
    else if (action === 'out') {
      const d = db.prepare('SELECT * FROM drivers WHERE id=?').get(driverId), pos = here || { lat: d.lat, lng: d.lng };
      const mins = ETA.etaMinutes(region, d.vehicle, pos, [], { lat: o.drop_lat, lng: o.drop_lng });
      const w = ETA.window(clock.now(), mins);
      res = { order: moveOrder(db, o, 'out_for_delivery', { eta_mid: w.mid }, actor, 'out_for_delivery'), eta: w };
      tell(db, o, 'out_for_delivery');
    } else if (action === 'deliver') {
      if (o.code_attempts >= region.rules.deliveryCodeMaxAttempts) throw err(429, 'too many wrong codes, call support');
      if (!body.code || !C.safeEqual(C.hash(String(body.code)), o.code_hash)) {
        db.prepare('UPDATE orders SET code_attempts=code_attempts+1 WHERE id=?').run(o.id);
        log(db, o.region_id, 'order', o.id, 'wrong_code', actor); // persists because we return, not throw
        return { error: 'wrong code', status: 403 };
      }
      const upd = moveOrder(db, o, 'delivered', {}, actor, 'delivered');
      settle(db, region, upd, run);
      tell(db, o, 'delivered');
      res = { order: upd };
    } else if (action === 'fail') {
      if (!body.reason) throw err(400, 'reason required');
      res = { order: moveOrder(db, o, 'failed', { fail_reason: body.reason }, actor, 'failed') };
    } else if (action === 'return') { // same-day return to sender confirmed by driver
      res = { order: moveOrder(db, o, 'returned', {}, actor, 'returned') };
      settle(db, region, res.order, run, true);
    } else throw err(400, 'unknown action');
    closeRunIfDone(db, region, run);
    return res;
  });
}

// Customer messages go out from the booking business's own WhatsApp number; a failed send never blocks delivery.
function tell(db, o, kind) {
  try { N.notify(db, { to: { role: 'customer', phone: o.drop_phone, businessId: o.account_id }, kind, data: { orderId: o.id } }); } catch { /* logged in notifications */ }
}

function settle(db, region, o, run, isReturn = false) {
  const prices = o.price_cents ?? o.cap_cents;
  const paid = o.cap_cents, msg = P.cents(region.pricing.messagingPerParcel);
  const share = region.pricing.platformShare[driverTier(db.prepare('SELECT * FROM drivers WHERE id=?').get(run.driver_id))];
  // Driver is paid their share of the parcel price whether delivered or returned; returns are billed the same.
  const driverCents = Math.round((prices - msg) * (1 - share));
  L.settleDelivery(db, region.id, o.id, { paidCents: paid, priceCents: prices, driverCents, messagingCents: msg, driverId: run.driver_id });
  if (paid - prices > 0) log(db, region.id, 'order', o.id, 'refund_due', 'system', { cents: paid - prices });
}

function closeRunIfDone(db, region, run) {
  const open = db.prepare("SELECT COUNT(*) AS n FROM orders WHERE run_id=? AND status NOT IN ('delivered','returned','failed','expired','cancelled')").get(run.id).n;
  const failed = db.prepare("SELECT COUNT(*) AS n FROM orders WHERE run_id=? AND status='failed'").get(run.id).n;
  if (open === 0 && failed === 0) {
    db.prepare("UPDATE runs SET status='completed' WHERE id=?").run(run.id);
    db.prepare("UPDATE drivers SET status='online' WHERE id=?").run(run.driver_id);
    log(db, region.id, 'run', run.id, 'completed', 'system');
  }
}

// ---------- tracking ----------
function recordPing(db, region, driverId, lat, lng, silent) {
  db.prepare('UPDATE drivers SET lat=?, lng=?, last_ping=? WHERE id=?').run(lat, lng, clock.now(), driverId);
  db.prepare('INSERT INTO pings (driver_id, at, lat, lng) VALUES (?,?,?,?)').run(driverId, clock.now(), lat, lng);
  const d = db.prepare('SELECT * FROM drivers WHERE id=?').get(driverId);
  const notes = [];
  for (const o of db.prepare("SELECT o.* FROM orders o JOIN runs r ON r.id=o.run_id WHERE r.driver_id=? AND o.status='out_for_delivery'").all(driverId)) {
    const mins = ETA.etaMinutes(region, d.vehicle, { lat, lng }, [], { lat: o.drop_lat, lng: o.drop_lng }), w = ETA.window(clock.now(), mins);
    if (ETA.shouldNotify(o.eta_mid, w.mid)) {
      db.prepare('UPDATE orders SET eta_mid=? WHERE id=?').run(w.mid, o.id);
      log(db, region.id, 'order', o.id, 'eta_changed', 'system', { mid: w.mid }); notes.push(o.id);
    }
  }
  return silent ? null : { notified: notes };
}
const ping = (db, region, driverId, lat, lng) => tx(db, () => recordPing(db, region, driverId, lat, lng, false));

function setPin(db, region, driverId, lat, lng) {
  db.prepare("UPDATE drivers SET pin_lat=?, pin_lng=?, pin_at=?, status=CASE WHEN status='offline' THEN 'online' ELSE status END WHERE id=?").run(lat, lng, clock.now(), driverId);
  log(db, region.id, 'driver', driverId, 'pin_set', `driver:${driverId}`, { lat, lng });
}

function track(db, region, orderId) {
  const o = getOrder(db, orderId); let driver = null;
  if (o.run_id) { const r = db.prepare('SELECT * FROM runs WHERE id=?').get(o.run_id); if (r?.driver_id) { const d = db.prepare('SELECT name,vehicle,lat,lng,last_ping FROM drivers WHERE id=?').get(r.driver_id); driver = d; } }
  const eta = o.eta_mid && o.status === 'out_for_delivery' ? { from: o.eta_mid - 20 * 60000, to: o.eta_mid + 20 * 60000 } : null;
  return { id: o.id, status: o.status, serviceDate: o.service_date, drop: { lat: o.drop_lat, lng: o.drop_lng }, driver: o.status === 'out_for_delivery' ? driver : null, eta,
    timeline: db.prepare("SELECT at,type FROM events WHERE entity='order' AND entity_id=? ORDER BY id").all(o.id) };
}

// ---------- hotspots ----------
function refreshHotspots(db, region) {
  const demand = [];
  for (const o of db.prepare("SELECT pickup_lat,pickup_lng FROM orders WHERE region_id=? AND status IN ('confirmed','batched')").all(region.id)) demand.push({ lat: o.pickup_lat, lng: o.pickup_lng, w: 1 });
  for (const a of db.prepare("SELECT lat,lng FROM accounts WHERE region_id=? AND kind='business' AND lat IS NOT NULL").all(region.id)) demand.push({ lat: a.lat, lng: a.lng, w: 0.4 });
  const since = clock.now() - 3600000, drivers = [];
  for (const d of db.prepare("SELECT * FROM drivers WHERE region_id=? AND status IN ('online')").all(region.id)) {
    if (d.last_ping > since && d.lat != null) drivers.push({ lat: d.lat, lng: d.lng });
    else if (d.pin_at > since && d.pin_lat != null) drivers.push({ lat: d.pin_lat, lng: d.pin_lng });
  }
  const prev = Object.fromEntries(db.prepare('SELECT cell,score FROM hotspots WHERE region_id=?').all(region.id).map((r) => [r.cell, r.score]));
  const list = hot.compute(region, { demandPoints: demand, driverPoints: drivers, prev });
  db.prepare('DELETE FROM hotspots WHERE region_id=?').run(region.id);
  const ins = db.prepare('INSERT INTO hotspots (region_id,cell,score,lat,lng,at) VALUES (?,?,?,?,?,?)');
  for (const h of list) ins.run(region.id, h.cell, h.score, h.lat, h.lng, clock.now());
  return list;
}
const currentHotspots = (db, region) => db.prepare('SELECT * FROM hotspots WHERE region_id=? ORDER BY score DESC').all(region.id);
function bonusSpent(db, region) {
  return db.prepare("SELECT COALESCE(SUM(bonus_cents),0) AS b FROM runs WHERE region_id=? AND service_date=? AND status IN ('accepted','completed')").get(region.id, today(region)).b;
}

// ---------- payouts ----------
function runPayouts(db, region) {
  return tx(db, () => {
    const out = [];
    for (const d of db.prepare('SELECT * FROM drivers WHERE region_id=?').all(region.id)) {
      const payable = -L.balance(db, `driver_payable:${d.id}`);
      if (payable <= 0) continue;
      const hold = Math.round((payable * region.payouts.holdbackPct) / 100), pay = payable - hold;
      L.post(db, region.id, 'weekly payout', `driver:${d.id}`, [{ account: `driver_payable:${d.id}`, amount: payable }, { account: 'bank', amount: -pay }, { account: `holdback:${d.id}`, amount: -hold }]);
      db.prepare('INSERT INTO payouts (driver_id, at, amount_cents, holdback_cents, status) VALUES (?,?,?,?,?)').run(d.id, clock.now(), pay, hold, 'sent');
      out.push({ driverId: d.id, paid: pay, held: hold });
    }
    return out;
  });
}
function releaseHoldbacks(db, region) {
  return tx(db, () => {
    const cutoff = clock.now() - region.payouts.holdbackDays * DAY, out = [];
    for (const p of db.prepare("SELECT * FROM payouts WHERE status='sent' AND at<=?").all(cutoff)) {
      if (p.holdback_cents > 0) L.post(db, region.id, 'holdback released', `payout:${p.id}`, [{ account: `holdback:${p.driver_id}`, amount: p.holdback_cents }, { account: 'bank', amount: -p.holdback_cents }]);
      db.prepare("UPDATE payouts SET status='released' WHERE id=?").run(p.id); out.push(p.id);
    }
    return out;
  });
}

// ---------- business wallet ----------
const walletAccount = (id) => `wallet:${id}`;
const walletBalance = (db, accountId) => -L.balance(db, walletAccount(accountId));

function walletTopup(db, region, accountId, cents) {
  if (!Number.isInteger(cents) || cents <= 0) throw err(400, 'amount must be a positive whole number of cents');
  return tx(db, () => {
    L.post(db, region.id, 'wallet topup', `account:${accountId}`, [
      { account: 'bank', amount: cents },
      { account: walletAccount(accountId), amount: -cents },
    ]);
    log(db, region.id, 'account', accountId, 'wallet_topup', 'account', { cents });
    return { balanceCents: walletBalance(db, accountId) };
  });
}

function walletStatement(db, accountId, limit = 50) {
  const rows = db.prepare('SELECT * FROM ledger WHERE account=? ORDER BY id DESC LIMIT ?').all(walletAccount(accountId), limit);
  let running = 0;
  return rows.reverse().map((r) => {
    running += -r.amount_cents;
    return { at: r.at, memo: r.memo, amountCents: -r.amount_cents, balanceCents: running, ref: r.ref };
  }).reverse();
}

function walletPayOrder(db, region, orderId, accountId) {
  return tx(db, () => {
    const o = getOrder(db, orderId);
    if (o.account_id !== accountId) throw err(403, 'not your order');
    if (o.status !== 'awaiting_payment') throw err(409, `order is ${o.status}`);
    const avail = walletBalance(db, accountId);
    if (avail < o.cap_cents) throw err(402, `Wallet balance R${(avail / 100).toFixed(2)} is below the cap R${(o.cap_cents / 100).toFixed(2)}. Please top up.`);
    L.post(db, region.id, 'wallet payment', `order:${orderId}`, [
      { account: walletAccount(accountId), amount: o.cap_cents },
      { account: `escrow:order:${orderId}`, amount: -o.cap_cents },
    ]);
    const t = C.newToken();
    const upd = moveOrder(db, o, 'awaiting_confirmation', { token_hash: t.hash, token_expires: clock.now() + region.rules.confirmationExpiryDays * DAY }, 'wallet', 'paid');
    return { order: upd, confirmToken: t.token };
  });
}

// ---------- store checkout links ----------
function createQuoteLink(db, region, body, storeId, mode = 'shopper') {
  const maxCents = region.rules.maxParcelPriceCents || 10000;
  const q = quote(region, body);
  if (q.cap > maxCents) throw err(422, `Price R${(q.cap / 100).toFixed(2)} exceeds ceiling R${(maxCents / 100).toFixed(2)}.`);
  const ttl = region.rules.quoteLinkTtlMs || 1800000;
  const t = C.newToken();
  db.prepare('INSERT INTO quote_links (store_id, token_hash, region_id, quote_json, mode, expires_at, created_at) VALUES (?,?,?,?,?,?,?)')
    .run(storeId || null, t.hash, region.id, JSON.stringify(body), mode, clock.now() + ttl, clock.now());
  return { token: t.token, expiresAt: clock.now() + ttl, quote: q };
}

function previewQuoteLink(db, token) {
  const row = db.prepare('SELECT * FROM quote_links WHERE token_hash=?').get(C.hash(token || ''));
  if (!row) throw err(404, 'link not found');
  if (row.expires_at < clock.now()) throw err(410, 'This delivery link has expired. Return to the store to choose delivery again.');
  if (row.used_at) throw err(409, 'This link has already been used.');
  return { storeId: row.store_id, spec: JSON.parse(row.quote_json), mode: row.mode, expiresAt: row.expires_at };
}

function redeemQuoteLink(db, region, token, pinBody) {
  // Each sub-operation has its own transaction; we cannot nest them.
  const row = db.prepare('SELECT * FROM quote_links WHERE token_hash=?').get(C.hash(token || ''));
  if (!row) throw err(404, 'link not found');
  if (row.expires_at < clock.now()) throw err(410, 'This delivery link has expired. Return to the store to choose delivery again.');
  if (row.used_at) throw err(409, 'This link has already been used.');
  const spec = JSON.parse(row.quote_json);
  if (pinBody?.lat && pinBody?.lng) spec.drop = { ...spec.drop, lat: pinBody.lat, lng: pinBody.lng };
  const orderResult = createOrder(db, region, { ...spec, accountId: row.store_id || null }, null);
  const o = orderResult.order;
  let confirmToken;
  if (row.mode === 'wallet' && row.store_id) {
    const r = walletPayOrder(db, region, o.id, row.store_id);
    confirmToken = r.confirmToken;
  } else {
    const r = markPaid(db, region, o.id);
    confirmToken = r.confirmToken;
  }
  db.prepare('UPDATE quote_links SET used_at=?, order_id=? WHERE id=?').run(clock.now(), o.id, row.id);
  return { order: getOrder(db, o.id), confirmToken };
}

// ---------- driver earnings ----------
function driverEarnings(db, driverId) {
  const entries = db.prepare("SELECT * FROM ledger WHERE account=? ORDER BY id DESC LIMIT 200").all(`driver_payable:${driverId}`);
  const payable = -L.balance(db, `driver_payable:${driverId}`);
  const runs = db.prepare("SELECT id, service_date, km, minutes, payout_cents, bonus_cents FROM runs WHERE driver_id=? AND status='completed' ORDER BY id DESC LIMIT 50").all(driverId);
  const payouts = db.prepare("SELECT at, amount_cents, holdback_cents, status FROM payouts WHERE driver_id=? ORDER BY id DESC LIMIT 20").all(driverId);
  return { payableCents: payable, entries: entries.map((r) => ({ at: r.at, memo: r.memo, amountCents: -r.amount_cents, ref: r.ref })), runs, payouts };
}

// ---------- B6: driver weekly statement ----------
function driverWeeklyStatement(db, driverId) {
  // Group completed runs by ISO week, return last 12 weeks
  const runs = db.prepare("SELECT id,service_date,payout_cents,bonus_cents FROM runs WHERE driver_id=? AND status='completed' ORDER BY service_date DESC LIMIT 200").all(driverId);
  const weeks = {};
  for (const r of runs) {
    const d = new Date(r.service_date + 'T12:00:00Z');
    // ISO week: Monday start
    const day = d.getUTCDay() || 7;
    const monday = new Date(d); monday.setUTCDate(d.getUTCDate() - day + 1);
    const wk = monday.toISOString().slice(0, 10);
    if (!weeks[wk]) weeks[wk] = { weekStart: wk, runCount: 0, earningsCents: 0, bonusCents: 0 };
    weeks[wk].runCount++;
    weeks[wk].earningsCents += r.payout_cents;
    weeks[wk].bonusCents += r.bonus_cents || 0;
  }
  const payouts = db.prepare("SELECT at, amount_cents, holdback_cents, status FROM payouts WHERE driver_id=? ORDER BY id DESC LIMIT 12").all(driverId);
  return { weeks: Object.values(weeks).sort((a, b) => b.weekStart.localeCompare(a.weekStart)).slice(0, 12), payouts };
}

// ---------- B7: cancel order with ledger refund ----------
function cancelOrder(db, region, orderId, actorKind, actorId, reason) {
  return tx(db, () => {
    const SM = require('./statemachine');
    const o = getOrder(db, orderId);
    SM.assertMove(o.status, 'cancelled');
    // Refund any escrow for this order
    const escrow = -L.balance(db, `escrow:order:${o.id}`);
    if (escrow > 0) {
      L.post(db, region.id, 'cancel refund', `order:${o.id}`, [
        { account: `escrow:order:${o.id}`, amount: escrow },
        { account: 'refund_due', amount: -escrow },
      ]);
    }
    SM.assertMove(o.status, 'cancelled'); // re-check (assertMove mutates nothing, just validates)
    db.prepare("UPDATE orders SET status='cancelled', updated_at=? WHERE id=?").run(clock.now(), o.id);
    log(db, region.id, 'order', o.id, 'cancelled', `${actorKind}:${actorId}`, { reason, refundCents: escrow });
    return { orderId: o.id, refundCents: escrow };
  });
}

// ---------- D3: driver onboarding ----------
function submitDocument(db, driverId, kind, fileRef) {
  const KINDS = ['id', 'vehicle_reg', 'pdp', 'profile_photo'];
  if (!KINDS.includes(kind)) throw err(400, `kind must be one of ${KINDS.join(', ')}`);
  if (!fileRef) throw err(400, 'file_ref required');
  db.prepare("DELETE FROM driver_documents WHERE driver_id=? AND kind=?").run(driverId, kind);
  const id = db.prepare('INSERT INTO driver_documents (driver_id, kind, file_ref, status, uploaded_at) VALUES (?,?,?,?,?)').run(driverId, kind, fileRef, 'pending', clock.now()).lastInsertRowid;
  return { id, kind, status: 'pending' };
}

function pendingApprovals(db) {
  const drivers = db.prepare("SELECT id,name,phone,vehicle,status FROM drivers").all();
  const docs = db.prepare("SELECT driver_id, kind, status FROM driver_documents").all();
  const byDriver = {};
  for (const d of docs) {
    if (!byDriver[d.driver_id]) byDriver[d.driver_id] = [];
    byDriver[d.driver_id].push({ kind: d.kind, status: d.status });
  }
  return drivers.filter(d => byDriver[d.id] && byDriver[d.id].some(doc => doc.status === 'pending'))
    .map(d => ({ ...d, documents: byDriver[d.id] }));
}

function approveDriver(db, region, driverId, adminId, approve, note) {
  const d = db.prepare('SELECT id FROM drivers WHERE id=?').get(driverId);
  if (!d) throw err(404, 'driver not found');
  const status = approve ? 'approved' : 'rejected';
  db.prepare("UPDATE driver_documents SET status=?, reviewed_at=?, note=? WHERE driver_id=? AND status='pending'").run(status, clock.now(), note || null, driverId);
  const action = approve ? 'driver_approved' : 'driver_rejected';
  log(db, region.id, 'driver', driverId, action, `admin:${adminId}`, { note });
  return { driverId, status };
}

// ---------- D4: proof of delivery photo (stand-in) ----------
// Real photo upload: multipart POST to a file store. For now: client sends a URL/filename.
// Logged to docs/GAPS.md — no real file storage connected.
function recordDeliveryPhoto(db, region, orderId, driverId, photoRef) {
  const o = getOrder(db, orderId);
  if (o.status !== 'out_for_delivery') throw err(409, 'order not out for delivery');
  db.prepare("UPDATE orders SET fail_reason=COALESCE(fail_reason,'') WHERE id=?").run(orderId); // no-op touch
  log(db, region.id, 'order', orderId, 'photo_ref', `driver:${driverId}`, { photoRef });
  return { ok: true, photoRef };
}

// ---------- G3: platform settings ----------
function getSettings(db) {
  return db.prepare('SELECT key, value, updated_at, updated_by FROM platform_settings ORDER BY key').all()
    .map(r => ({ key: r.key, value: JSON.parse(r.value), updatedAt: r.updated_at, updatedBy: r.updated_by }));
}

function setSetting(db, region, key, value, adminId) {
  if (!key || key.length > 80) throw err(400, 'invalid key');
  const v = JSON.stringify(value);
  db.prepare('INSERT INTO platform_settings (key,value,updated_at,updated_by) VALUES (?,?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at,updated_by=excluded.updated_by').run(key, v, clock.now(), String(adminId));
  log(db, region.id, 'settings', 0, 'setting_updated', `admin:${adminId}`, { key, value });
  return { key, value };
}

// ---------- G4: disputes ----------
function openDispute(db, region, orderId, reporter, reason) {
  const o = getOrder(db, orderId);
  const id = db.prepare('INSERT INTO disputes (order_id, reporter, reason, status, created_at) VALUES (?,?,?,?,?)').run(o.id, reporter, reason || null, 'open', clock.now()).lastInsertRowid;
  log(db, region.id, 'order', o.id, 'dispute_opened', reporter, { reason });
  return { id, orderId: o.id, status: 'open' };
}

function listDisputes(db, status = 'open') {
  return db.prepare("SELECT d.*, o.status order_status FROM disputes d LEFT JOIN orders o ON o.id=d.order_id WHERE d.status=? ORDER BY d.id DESC LIMIT 100").all(status);
}

function resolveDispute(db, region, disputeId, adminId, note) {
  const d = db.prepare('SELECT * FROM disputes WHERE id=?').get(disputeId);
  if (!d) throw err(404, 'dispute not found');
  if (d.status !== 'open') throw err(409, 'dispute already resolved');
  db.prepare("UPDATE disputes SET status='resolved', resolved_at=?, note=? WHERE id=?").run(clock.now(), note || null, disputeId);
  log(db, region.id, 'order', d.order_id, 'dispute_resolved', `admin:${adminId}`, { note });
  return { id: disputeId, status: 'resolved' };
}

// ---------- admin helpers ----------
function adminSuspendDriver(db, region, driverId) {
  const A = require('./auth');
  A.suspendDriver(db, driverId);
  log(db, region.id, 'driver', driverId, 'suspended', 'admin', {});
}

function notificationLog(db, region, limit = 100) {
  return db.prepare('SELECT * FROM notifications ORDER BY id DESC LIMIT ?').all(limit);
}

// ---------- admin ----------
function overview(db, region) {
  const q = (s, ...a) => db.prepare(s).all(...a);
  return {
    date: today(region),
    orders: Object.fromEntries(q('SELECT status, COUNT(*) n FROM orders WHERE region_id=? GROUP BY status', region.id).map((r) => [r.status, r.n])),
    runs: Object.fromEntries(q('SELECT status, COUNT(*) n FROM runs WHERE region_id=? GROUP BY status', region.id).map((r) => [r.status, r.n])),
    money: { revenue: -L.balance(db, 'platform_revenue'), messaging: -L.balance(db, 'messaging_cost'), refundsDue: -L.balance(db, 'refund_due'), escrow: -q("SELECT COALESCE(SUM(amount_cents),0) b FROM ledger WHERE account LIKE 'escrow:%'")[0].b, driverPayable: -q("SELECT COALESCE(SUM(amount_cents),0) b FROM ledger WHERE account LIKE 'driver_payable:%'")[0].b, wallets: q("SELECT account, -SUM(amount_cents) bal FROM ledger WHERE account LIKE 'wallet:%' GROUP BY account"), ledgerBalanced: L.total(db) === 0 },
    hotspots: currentHotspots(db, region).slice(0, 8),
    drivers: q('SELECT id,name,vehicle,status,lat,lng,pro_until FROM drivers WHERE region_id=?', region.id),
    events: q('SELECT at,entity,entity_id,type,actor FROM events WHERE region_id=? ORDER BY id DESC LIMIT 30', region.id),
  };
}

module.exports = {
  loadRegions, localParts, addDays, today, createAccount, createDriver, buyPro, quote, createOrder, markPaid, previewConfirm, confirm, sweepUnconfirmed,
  dispatch, listOpenRuns, acceptRun, releaseRun, scan, ping, setPin, track, refreshHotspots, currentHotspots, runPayouts, releaseHoldbacks, overview, getOrder, driverTier, err,
  walletBalance, walletTopup, walletStatement, walletPayOrder,
  createQuoteLink, previewQuoteLink, redeemQuoteLink,
  driverEarnings, adminSuspendDriver, notificationLog,
  driverWeeklyStatement, cancelOrder,
  submitDocument, pendingApprovals, approveDriver,
  recordDeliveryPhoto,
  getSettings, setSetting,
  openDispute, listDisputes, resolveDispute,
};
