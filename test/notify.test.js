const test = require('node:test'), assert = require('node:assert/strict');
const { setup } = require('./helpers');
const N = require('../src/notify'), A = require('../src/auth');

const fresh = () => { const { db } = setup(); N.outbox.length = 0; return db; };
const rows = (db) => db.prepare('SELECT channel, ok, reason, sender FROM notifications ORDER BY id').all();
const real = { ...N.adapters };
const failing = (reason) => ({ fake: true, send: () => ({ ok: false, reason }) });
const restore = () => Object.assign(N.adapters, real);

test('falls back in channel order and logs every attempt', () => {
  const db = fresh(); N.adapters.sms = failing('down');
  try {
    const r = N.notify(db, { to: { role: 'driver', id: 1, phone: '071', email: 'd@x.co' }, kind: 'wallet_low' });
    assert.equal(r.ok, true); assert.equal(r.channel, 'email');
    assert.deepEqual(rows(db).map((x) => [x.channel, x.ok]), [['sms', 0], ['email', 1]]);
    assert.equal(rows(db)[0].reason, 'down');
  } finally { restore(); }
});

test('custom channel order is respected', () => {
  const db = fresh(); N.setPrefs(db, 'driver', 1, { channelOrder: ['email', 'sms'] });
  const r = N.notify(db, { to: { role: 'driver', id: 1, phone: '071', email: 'd@x.co' }, kind: 'delivered', data: { orderId: 3 } });
  assert.equal(r.channel, 'email');
});

test('all channels failing returns ok:false with attempts', () => {
  const db = fresh();
  const r = N.notify(db, { to: { role: 'driver', id: 1 }, kind: 'wallet_low' }); // no phone, no email
  assert.equal(r.ok, false); assert.equal(r.attempts.length, 2);
  assert.equal(rows(db).filter((x) => x.ok).length, 0);
});

test('customer whatsapp goes out from the business number only; never the platform', () => {
  const db = fresh(); const to = { role: 'customer', phone: '083', businessId: 7 };
  let r = N.notify(db, { to, kind: 'delivered', data: { orderId: 1 } });
  // whatsapp fails (no business number), sms falls back and succeeds; platform never sends whatsapp
  assert.equal(r.ok, true); assert.equal(r.channel, 'sms');
  assert.match(rows(db)[0].reason, /no verified whatsapp/);
  N.connectBusinessChannel(db, 7, 'whatsapp', '0115550000', false);
  assert.equal(N.notify(db, { to, kind: 'delivered', data: { orderId: 1 } }).channel, 'sms'); // unverified whatsapp → sms fallback
  N.connectBusinessChannel(db, 7, 'whatsapp', '0115550000', true);
  r = N.notify(db, { to, kind: 'delivered', data: { orderId: 1 } });
  assert.equal(r.channel, 'whatsapp'); assert.equal(N.outbox.at(-1).from, '0115550000');
});

test('drivers never get whatsapp from a business number', () => {
  const db = fresh(); N.connectBusinessChannel(db, 7, 'whatsapp', '0115550000', true);
  N.setPrefs(db, 'driver', 1, { channelOrder: ['whatsapp'] });
  const r = N.notify(db, { to: { role: 'driver', id: 1, phone: '071', businessId: 7 }, kind: 'driver_assigned', data: { orderId: 1 } });
  assert.equal(r.ok, false); assert.equal(N.outbox.length, 0);
});

test('marketing opt-out never blocks service messages', () => {
  const db = fresh(); N.setPrefs(db, 'driver', 1, { marketingOptOut: true });
  assert.equal(N.notify(db, { to: { role: 'driver', id: 1, phone: '071' }, kind: 'otp_code', data: { code: '123456' } }).ok, true);
  assert.throws(() => N.notify(db, { to: { role: 'driver', id: 1, phone: '071' }, kind: 'promo' }), /unknown message kind/);
});

test('OTP goes through notify; code shown only in dev with fake adapters', () => {
  const db = fresh();
  db.prepare("INSERT INTO drivers (region_id, name, phone, vehicle) VALUES ('za-jhb','D','071','car')").run();
  const dev = A.requestOtp(db, '071', 'd1');
  assert.match(dev.devCode, /^\d{6}$/); assert.match(N.outbox.at(-1).body, new RegExp(dev.devCode));
  const old = process.env.DEV; delete process.env.DEV;
  try {
    const live = A.requestOtp(db, '071', 'd2');
    assert.equal(live.devCode, undefined); assert.equal(live.sent, true);
    assert.ok(!JSON.stringify(live).match(/\d{6}/));
  } finally { process.env.DEV = old; }
  process.env.DEV = '1'; N.adapters.sms = { send: () => ({ ok: true, id: 'x' }) }; // a real adapter
  try { assert.equal(A.requestOtp(db, '071', 'd3').devCode, undefined); } finally { restore(); }
});
