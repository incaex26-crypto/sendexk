// Zero-dependency HTTP server: JSON API + static pages. `npm start` and open http://localhost:3000
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { open } = require('./src/db');
const S = require('./src/service');

const A = require('./src/auth');
const PUBLIC = path.join(__dirname, 'public');
const MAPS_DIR = path.join(__dirname, 'data', 'maps');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };

function createApp({ db, regions }) {
  const first = Object.values(regions)[0];
  const regionOf = (url) => regions[url.searchParams.get('region')] || first;
  const routes = [];
  const add = (method, pattern, handler, opts = {}) => routes.push({ method, re: new RegExp('^' + pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$'), handler, opts });

  // ---- public ----
  add('GET', '/api/health', () => ({ ok: true }));
  add('GET', '/api/region', ({ region }) => ({ id: region.id, name: region.name, brand: region.brand, center: region.center, zones: region.zones, vehicles: Object.fromEntries(Object.entries(region.vehicles).map(([k, v]) => [k, { label: v.label, energy: v.energy }])), cutoffs: region.cutoffs, currency: region.currency, status: region.status, map: region.map || null }));
  add('POST', '/api/quote', ({ region, body }) => S.quote(region, body));
  add('POST', '/api/orders', ({ region, body, req }) => { const r = S.createOrder(db, region, body, req.headers['idempotency-key']); return { status: r.replay ? 200 : 201, body: { order: pub(r.order), quote: r.quote } }; });
  add('GET', '/api/orders/:id/track', ({ region, params }) => S.track(db, region, +params.id));
  // Mock payment (replace with provider webhook). Dev only.
  add('POST', '/api/orders/:id/pay', ({ region, params }) => { if (process.env.NODE_ENV === 'production') throw S.err(403, 'disabled'); const r = S.markPaid(db, region, +params.id); return { order: pub(r.order), confirmUrl: `/confirm.html?t=${r.confirmToken}` }; });
  add('GET', '/api/confirm/:token', ({ region, params }) => S.previewConfirm(db, region, params.token));
  add('POST', '/api/confirm/:token', ({ region, params, body }) => { const r = S.confirm(db, region, params.token, body); return { order: pub(r.order), deliveryCode: r.deliveryCode, serviceDate: r.serviceDate, rolled: r.rolled }; });

  // ---- driver (starter auth: x-driver-id header. NOT SECURE. Replace with phone OTP, see spec 05) ----
  add('POST', '/api/drivers', ({ region, body }) => ({ status: 201, body: { id: S.createDriver(db, region, body) } }));
  add('GET', '/api/driver/runs', ({ region, driver }) => S.listOpenRuns(db, region, driver), { driver: true });
  add('POST', '/api/driver/runs/:id/accept', ({ region, params, driver }) => { const r = S.acceptRun(db, region, +params.id, driver); return { run: r.view }; }, { driver: true });
  add('POST', '/api/driver/runs/:id/release', ({ region, params, driver }) => { S.releaseRun(db, region, +params.id, driver); return { ok: true }; }, { driver: true });
  add('GET', '/api/driver/me', ({ region, driver }) => {
    const d = db.prepare('SELECT * FROM drivers WHERE id=?').get(driver); if (!d) throw S.err(404, 'not found');
    const run = db.prepare("SELECT * FROM runs WHERE driver_id=? AND status='accepted' ORDER BY id DESC LIMIT 1").get(driver);
    const parcels = run ? db.prepare('SELECT id,status,drop_name,drop_addr,drop_lat,drop_lng,pickup_name,pickup_addr,pickup_lat,pickup_lng,seq FROM orders WHERE run_id=? ORDER BY seq').all(run.id) : [];
    return { driver: { id: d.id, name: d.name, vehicle: d.vehicle, tier: S.driverTier(d), proUntil: d.pro_until, status: d.status }, run: run && { id: run.id, payoutCents: run.payout_cents, km: run.km }, parcels, hotspots: S.currentHotspots(db, region).slice(0, 5) };
  }, { driver: true });
  add('POST', '/api/driver/ping', ({ region, body, driver }) => S.ping(db, region, driver, body.lat, body.lng), { driver: true });
  add('POST', '/api/driver/pin', ({ region, body, driver }) => { S.setPin(db, region, driver, body.lat, body.lng); return { ok: true }; }, { driver: true });
  add('POST', '/api/driver/pro', ({ region, driver }) => S.buyPro(db, region, driver), { driver: true }); // mock payment
  add('POST', '/api/driver/scan/:orderId', ({ region, params, body, driver }) => { const r = S.scan(db, region, +params.orderId, driver, body.action, body); if (r.error) return { status: r.status, body: { error: r.error } }; return { order: pub(r.order), eta: r.eta }; }, { driver: true });

  // ---- driver login (phone OTP) ----
  add('POST', '/api/driver/otp', ({ body, req }) => A.requestOtp(db, body.phone, req.headers['x-device-id'] || req.socket.remoteAddress));
  add('POST', '/api/driver/verify', ({ body }) => { const r = A.verifyOtp(db, body.phone, body.code); return { driverId: r.driverId, token: r.token }; });

  // ---- admin ----
  add('POST', '/api/admin/login', ({ body, res }) => {
    const token = A.adminLogin(db, body.email, body.password);
    res.setHeader('set-cookie', `${COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`);
    return { ok: true };
  });
  add('POST', '/api/admin/logout', ({ req, res }) => { const t = cookieOf(req); if (t) A.endSession(db, t); res.setHeader('set-cookie', `${COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`); return { ok: true }; });
  add('GET', '/api/admin/overview', ({ region }) => S.overview(db, region), { admin: true });
  add('POST', '/api/admin/dispatch', ({ region, body }) => S.dispatch(db, region, body.date), { admin: true });
  add('POST', '/api/admin/sweep', ({ region }) => S.sweepUnconfirmed(db, region), { admin: true });
  add('POST', '/api/admin/hotspots', ({ region }) => S.refreshHotspots(db, region), { admin: true });
  add('POST', '/api/admin/payouts', ({ region }) => S.runPayouts(db, region), { admin: true });
  add('GET', '/api/admin/orders/:id', ({ params }) => ({ order: pub(S.getOrder(db, +params.id)), events: db.prepare("SELECT * FROM events WHERE entity='order' AND entity_id=? ORDER BY id").all(+params.id) }), { admin: true });

  const COOKIE = 'admin_session';
  const cookieOf = (req) => { const m = new RegExp(`(?:^|;\\s*)${COOKIE}=([0-9a-f]+)`).exec(req.headers.cookie || ''); return m && m[1]; };
  A.cleanup(db); setInterval(() => A.cleanup(db), 3600_000).unref(); // hourly tidy-up of expired codes, sessions, limits

  function pub(o) { const { token_hash, code_hash, idem_key, ...rest } = o; return rest; }

  async function handle(req, res) {
    const url = new URL(req.url, 'http://x');
    try {
      if (!url.pathname.startsWith('/api/')) return serveStatic(url.pathname, req, res);
      for (const r of routes) {
        if (r.method !== req.method) continue;
        const m = r.re.exec(url.pathname); if (!m) continue;
        if (r.opts.admin && !A.sessionSubject(db, 'admin', cookieOf(req))) return send(res, 401, { error: 'Admin login required.' });
        let driver = null;
        if (r.opts.driver) {
          const auth = req.headers.authorization || '';
          driver = A.driverFromRequest(db, auth.startsWith('Bearer ') ? auth.slice(7) : null, req.headers['x-driver-id']);
          if (!driver) return send(res, 401, { error: 'Driver login required.' });
        }
        const body = (req.method === 'POST' || req.method === 'PUT') ? await readJson(req) : {};
        const out = await r.handler({ req, res, url, region: regionOf(url), params: m.groups || {}, body, driver });
        if (out && out.status && out.body) return send(res, out.status, out.body);
        return send(res, 200, out);
      }
      send(res, 404, { error: 'not found' });
    } catch (e) {
      if (!e.status) console.error(e);
      send(res, e.status || 500, { error: e.status ? e.message : 'internal error' });
    }
  }
  return http.createServer(handle);
}

function send(res, status, body) { const s = JSON.stringify(body); res.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(s), 'cache-control': 'no-store' }); res.end(s); }
function readJson(req) {
  return new Promise((resolve, reject) => {
    let n = 0, chunks = [];
    req.on('data', (c) => { n += c.length; if (n > 100_000) { reject(Object.assign(new Error('body too large'), { status: 413 })); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { if (!chunks.length) return resolve({}); try { resolve(JSON.parse(Buffer.concat(chunks))); } catch { reject(Object.assign(new Error('invalid JSON'), { status: 400 })); } });
  });
}
function serveStatic(p, req, res) {
  // PMTiles need HTTP range requests so the browser can seek inside the file.
  if (p.startsWith('/maps/')) {
    const file = path.normalize(path.join(MAPS_DIR, p.slice('/maps/'.length)));
    if (!file.startsWith(MAPS_DIR)) { res.writeHead(403); return res.end('forbidden'); }
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end('not found'); }
    return serveRange(file, req, res);
  }
  const rel = p === '/' ? '/index.html' : p, file = path.normalize(path.join(PUBLIC, rel));
  if (!file.startsWith(PUBLIC) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' }); fs.createReadStream(file).pipe(res);
}

function serveRange(file, req, res) {
  const total = fs.statSync(file).size;
  const corsH = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Range', 'Accept-Ranges': 'bytes', 'Cache-Control': 'public, max-age=86400' };
  if (req.method === 'OPTIONS') { res.writeHead(204, { ...corsH, 'Access-Control-Allow-Methods': 'GET, HEAD' }); return res.end(); }
  const rangeHdr = req.headers['range'];
  if (rangeHdr) {
    const m = /bytes=(\d+)-(\d*)/.exec(rangeHdr);
    if (!m) { res.writeHead(416, { 'Content-Range': `bytes */${total}` }); return res.end(); }
    const start = parseInt(m[1], 10), end = m[2] ? parseInt(m[2], 10) : total - 1;
    if (start > end || end >= total) { res.writeHead(416, { 'Content-Range': `bytes */${total}` }); return res.end(); }
    res.writeHead(206, { ...corsH, 'Content-Type': 'application/octet-stream', 'Content-Length': end - start + 1, 'Content-Range': `bytes ${start}-${end}/${total}` });
    fs.createReadStream(file, { start, end }).pipe(res);
  } else {
    res.writeHead(200, { ...corsH, 'Content-Type': 'application/octet-stream', 'Content-Length': total });
    fs.createReadStream(file).pipe(res);
  }
}

if (require.main === module) {
  const db = open(process.env.DB || path.join(__dirname, 'data', 'app.db')), regions = S.loadRegions(db);
  const port = Number(process.env.PORT || 3000);
  createApp({ db, regions }).listen(port, () => console.log(`Dispatch starter on http://localhost:${port}  (regions: ${Object.keys(regions).join(', ')})`));
}
module.exports = { createApp };
