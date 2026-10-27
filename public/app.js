// Tiny shared helpers: API calls, money formatting and a schematic SVG map (no tiles, no network).
const $ = (s, r = document) => r.querySelector(s);
const R = (c) => 'R' + (c / 100).toFixed(2);
async function api(method, path, body, headers = {}) {
  const r = await fetch(path, { method, headers: { 'content-type': 'application/json', ...headers }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({})); if (!r.ok) throw Object.assign(new Error(j.error || r.statusText), { status: r.status }); return j;
}
function mapView(el, region, { w = 640, h = 420, pins = [], onPin } = {}) {
  const zs = region.zones, pad = 0.03;
  const minLat = Math.min(...zs.map(z => z.lat)) - pad, maxLat = Math.max(...zs.map(z => z.lat)) + pad, minLng = Math.min(...zs.map(z => z.lng)) - pad, maxLng = Math.max(...zs.map(z => z.lng)) + pad;
  const x = (lng) => ((lng - minLng) / (maxLng - minLng)) * w, y = (lat) => h - ((lat - minLat) / (maxLat - minLat)) * h;
  const inv = (px, py) => ({ lng: minLng + (px / w) * (maxLng - minLng), lat: minLat + ((h - py) / h) * (maxLat - minLat) });
  el.innerHTML = `<svg class="map" viewBox="0 0 ${w} ${h}">${zs.map(z => `<circle cx="${x(z.lng)}" cy="${y(z.lat)}" r="34" fill="currentColor" opacity=".07"/><text x="${x(z.lng)}" y="${y(z.lat)}" text-anchor="middle" font-size="12" fill="currentColor" opacity=".6">${z.name}</text>`).join('')}<g id="pins"></g></svg>`;
  const svg = el.firstChild, g = svg.querySelector('#pins');
  const draw = (list) => { g.innerHTML = list.map(p => `<g transform="translate(${x(p.lng)},${y(p.lat)})"><circle r="${p.r || 8}" fill="${p.color || '#e8590c'}" stroke="#fff" stroke-width="2"/>${p.label ? `<text y="-12" text-anchor="middle" font-size="11" fill="currentColor">${p.label}</text>` : ''}</g>`).join(''); };
  draw(pins);
  if (onPin) { const move = (e) => { const b = svg.getBoundingClientRect(), t = e.touches ? e.touches[0] : e; onPin(inv(((t.clientX - b.left) / b.width) * w, ((t.clientY - b.top) / b.height) * h)); }; let down = false;
    svg.addEventListener('pointerdown', (e) => { down = true; move(e); }); svg.addEventListener('pointermove', (e) => down && move(e)); window.addEventListener('pointerup', () => (down = false)); }
  return { draw };
}
