const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { geocode } = require('../src/geocode');
const { createApp } = require('../server');
const { setup } = require('./helpers');

const MAPS_DIR = path.join(__dirname, '..', 'data', 'maps');
const TMP_FILE = path.join(MAPS_DIR, '_test_range.bin');
// content: "hello world range test" (22 bytes)
const TMP_CONTENT = Buffer.from('hello world range test');

describe('geocode provider is swappable', () => {
  it('uses a custom provider when supplied', async () => {
    const fake = async (_addr, _reg) => ({ lat: -26.1, lng: 28.0, confidence: 'exact' });
    const result = await geocode('1 Sandton Drive', { country: 'ZA' }, fake);
    assert.equal(result.lat, -26.1);
    assert.equal(result.lng, 28.0);
    assert.equal(result.confidence, 'exact');
  });

  it('returns null when the provider finds nothing', async () => {
    const empty = async () => null;
    const result = await geocode('xkzqwerty', {}, empty);
    assert.equal(result, null);
  });

  it('passes address and region through to the provider', async () => {
    let received = {};
    const capture = async (addr, reg) => { received = { addr, reg }; return null; };
    await geocode('123 Test St', { country: 'ZA', id: 'za-jhb' }, capture);
    assert.equal(received.addr, '123 Test St');
    assert.equal(received.reg.country, 'ZA');
  });
});

describe('/maps route', () => {
  let srv, base;

  before(async () => {
    const { db, region } = setup();
    srv = createApp({ db, regions: { [region.id]: region } });
    await new Promise((r) => srv.listen(0, r));
    base = `http://127.0.0.1:${srv.address().port}`;
    fs.mkdirSync(MAPS_DIR, { recursive: true });
    fs.writeFileSync(TMP_FILE, TMP_CONTENT);
  });

  after(() => {
    if (fs.existsSync(TMP_FILE)) fs.unlinkSync(TMP_FILE);
    srv.close();
  });

  it('returns 404 for a missing file', async () => {
    const r = await fetch(base + '/maps/nope.pmtiles');
    assert.equal(r.status, 404);
  });

  it('path traversal is blocked or normalized away', async () => {
    // %2e%2e is URL-encoded ".."; the URL parser normalises it out of /maps/,
    // so the request never reaches serveRange — either way we must not get the file.
    const r = await fetch(base + '/maps/%2e%2e/package.json');
    assert.ok(r.status === 403 || r.status === 404, `expected 403 or 404, got ${r.status}`);
  });

  it('returns 200 with Accept-Ranges for a full request', async () => {
    const r = await fetch(base + '/maps/_test_range.bin');
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('accept-ranges'), 'bytes');
    const buf = Buffer.from(await r.arrayBuffer());
    assert.ok(buf.equals(TMP_CONTENT));
  });

  it('returns 206 with correct bytes for a range request', async () => {
    const r = await fetch(base + '/maps/_test_range.bin', { headers: { range: 'bytes=0-4' } });
    assert.equal(r.status, 206);
    assert.match(r.headers.get('content-range') || '', /^bytes 0-4\//);
    const text = await r.text();
    assert.equal(text, 'hello');
  });
});
