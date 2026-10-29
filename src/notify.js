// One entry point for all messages: notify({ to, kind, data }).
// to = { role: 'driver'|'customer'|'business', id?, phone?, email?, businessId? }
// Channels are adapters with send() -> { ok, id } | { ok:false, reason }. Only fake ones exist for now;
// real providers plug in later behind the same shape.
const clock = require('./clock');
const TEMPLATES = require('./templates');

const DEFAULT_ORDER = { driver: ['sms', 'email'], customer: ['whatsapp', 'sms', 'email'], business: ['email', 'whatsapp'] };
const outbox = []; // in-memory copy for tests

function fakeAdapter(channel) {
  return {
    fake: true,
    send({ address, from, body, kind }) {
      if (!address) return { ok: false, reason: 'no address' };
      const id = `fake-${channel}-${outbox.length + 1}`;
      outbox.push({ id, channel, address, from, body, kind });
      return { ok: true, id };
    },
  };
}
const adapters = { whatsapp: fakeAdapter('whatsapp'), sms: fakeAdapter('sms'), email: fakeAdapter('email') };

function initNotify(db) {
  db.exec(`
CREATE TABLE IF NOT EXISTS notifications (id INTEGER PRIMARY KEY, at INTEGER, role TEXT, ref TEXT, kind TEXT, channel TEXT, address TEXT, sender TEXT, ok INTEGER, reason TEXT, provider_id TEXT);
CREATE TABLE IF NOT EXISTS business_channels (business_id INTEGER NOT NULL, channel TEXT NOT NULL, address TEXT NOT NULL, verified_at INTEGER, PRIMARY KEY (business_id, channel));
CREATE TABLE IF NOT EXISTS notify_prefs (role TEXT NOT NULL, ref TEXT NOT NULL, channel_order TEXT, marketing_opt_out INTEGER DEFAULT 0, PRIMARY KEY (role, ref));`);
}

function setPrefs(db, role, ref, { channelOrder, marketingOptOut }) {
  db.prepare('INSERT INTO notify_prefs (role, ref, channel_order, marketing_opt_out) VALUES (?,?,?,?) ON CONFLICT(role, ref) DO UPDATE SET channel_order=excluded.channel_order, marketing_opt_out=excluded.marketing_opt_out')
    .run(role, String(ref), channelOrder ? channelOrder.join(',') : null, marketingOptOut ? 1 : 0);
}

function connectBusinessChannel(db, businessId, channel, address, verified = false) {
  db.prepare('INSERT OR REPLACE INTO business_channels (business_id, channel, address, verified_at) VALUES (?,?,?,?)').run(businessId, channel, address, verified ? clock.now() : null);
}

// Decide who sends. The platform never sends from its own WhatsApp number.
function route(db, to, channel) {
  const address = channel === 'email' ? to.email : to.phone;
  if (channel !== 'whatsapp') return { address, from: 'platform' };
  if (to.role === 'driver') return { reason: 'drivers never get whatsapp from a business number' };
  if (!to.businessId) return { reason: 'whatsapp needs a business number' };
  const bc = db.prepare("SELECT address FROM business_channels WHERE business_id=? AND channel='whatsapp' AND verified_at IS NOT NULL").get(to.businessId);
  if (!bc) return { reason: 'business has no verified whatsapp number' };
  return { address, from: bc.address };
}

function notify(db, { to, kind, data = {} }) {
  const template = TEMPLATES[kind];
  if (!template) throw new Error(`unknown message kind: ${kind}`);
  const body = template(data);
  const ref = String(to.id ?? to.businessId ?? to.phone ?? to.email ?? '');
  const prefs = db.prepare('SELECT * FROM notify_prefs WHERE role=? AND ref=?').get(to.role, ref);
  // Opt-out only stops marketing, and there are no marketing kinds, so service messages always send.
  const order = (prefs && prefs.channel_order ? prefs.channel_order.split(',') : DEFAULT_ORDER[to.role]) || [];
  const attempts = [];
  const log = db.prepare('INSERT INTO notifications (at, role, ref, kind, channel, address, sender, ok, reason, provider_id) VALUES (?,?,?,?,?,?,?,?,?,?)');
  for (const channel of order) {
    const r = route(db, to, channel);
    let res;
    if (r.reason) res = { ok: false, reason: r.reason };
    else {
      try { res = adapters[channel].send({ address: r.address, from: r.from, body, kind }); }
      catch (e) { res = { ok: false, reason: e.message }; }
    }
    log.run(clock.now(), to.role, ref, kind, channel, r.address || null, r.from || null, res.ok ? 1 : 0, res.reason || null, res.id || null);
    attempts.push({ channel, ok: res.ok, reason: res.reason });
    if (res.ok) return { ok: true, channel, id: res.id, attempts };
  }
  return { ok: false, reason: 'all channels failed', attempts };
}

// Dev may show OTP codes on screen only with fake adapters AND a server started via npm run dev (DEV=1).
function devCodesVisible() {
  return process.env.DEV === '1' && Object.values(adapters).every((a) => a.fake);
}

module.exports = { notify, initNotify, setPrefs, connectBusinessChannel, devCodesVisible, adapters, outbox };
