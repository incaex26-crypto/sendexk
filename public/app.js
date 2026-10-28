// Shared browser helpers — loaded on every page
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

// Format whole cents as "R125.00"
const R = (cents) => 'R' + (cents / 100).toFixed(2);

// Format a date string as "Thu 29 Oct"
function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short' });
}

// Format an ISO timestamp as "14:35"
function fmtTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' });
}

// JSON API helper — throws on non-2xx with a plain error message
async function api(method, path, body, headers = {}) {
  const r = await fetch(path, {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error || r.statusText), { status: r.status });
  return j;
}

// ── MapLibre tile map ────────────────────────────────────────────────────────
let _pmProto = false;

function _ensureProtocol() {
  if (_pmProto || !window.pmtiles || !window.maplibregl) return;
  const p = new pmtiles.Protocol();
  maplibregl.addProtocol('pmtiles', p.tile.bind(p));
  _pmProto = true;
}

function _buildStyle(tileUrl) {
  return {
    version: 8,
    sources: {
      base: {
        type: 'vector', url: tileUrl,
        attribution: '© <a href="https://openstreetmap.org">OpenStreetMap</a>',
      },
    },
    layers: [
      { id: 'bg',       type: 'background', paint: { 'background-color': '#f0ece6' } },
      { id: 'earth',    type: 'fill',   source: 'base', 'source-layer': 'earth',    paint: { 'fill-color': '#f0ece6' } },
      { id: 'water',    type: 'fill',   source: 'base', 'source-layer': 'water',    paint: { 'fill-color': '#a8d0e6' } },
      { id: 'landuse',  type: 'fill',   source: 'base', 'source-layer': 'landuse',  paint: { 'fill-color': '#dff0d0', 'fill-opacity': 0.5 } },
      { id: 'buildings', type: 'fill',  source: 'base', 'source-layer': 'buildings', minzoom: 13, paint: { 'fill-color': '#d8d4cc', 'fill-outline-color': '#b0aba4' } },
      { id: 'roads',    type: 'line',   source: 'base', 'source-layer': 'roads',
        paint: { 'line-color': '#fff', 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.5, 16, 4] } },
      { id: 'roads_major', type: 'line', source: 'base', 'source-layer': 'roads',
        filter: ['in', ['get', 'pmap:kind'], ['literal', ['highway', 'major_road']]],
        paint: { 'line-color': '#f0e070', 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 1.5, 16, 8] } },
    ],
  };
}

/**
 * Create a MapLibre map in el.
 * marker: { lat, lng, type: 'pickup'|'drop'|'driver'|'drag', label?, draggable?, onDrag?, popup? }
 * Returns { setMarkers(list), map, remove() } or null if libs not loaded.
 */
function tileMap(el, region, { height = '360px', center, zoom = 11, onPickup, onDrop, markers = [] } = {}) {
  if (!window.maplibregl || !window.pmtiles) {
    el.innerHTML = '<div class="map-fallback">Map not available. Run <code>npm run get-map</code> in the terminal, then reload this page.</div>';
    return null;
  }
  _ensureProtocol();
  el.style.height = height;

  const tilesPath = (region && region.map && region.map.tilesUrl) || '/maps/jhb.pmtiles';
  const tileUrl = 'pmtiles://' + location.origin + tilesPath;
  const c = center || (region && region.center ? [region.center.lng, region.center.lat] : [28.05, -26.10]);

  const map = new maplibregl.Map({ container: el, style: _buildStyle(tileUrl), center: c, zoom, attributionControl: true });

  let _loaded = false, _pending = null;
  const _active = [];

  function _applyMarkers(list) {
    _active.forEach(m => m.remove());
    _active.length = 0;
    list.forEach(p => {
      const div = document.createElement('div');
      div.className = 'map-marker'
        + (p.type === 'drop' ? ' drop' : p.type === 'driver' ? ' driver' : p.type === 'drag' ? ' drag' : '');
      if (p.label != null) div.textContent = p.label;
      const m = new maplibregl.Marker({ element: div, draggable: !!p.draggable })
        .setLngLat([p.lng, p.lat]).addTo(map);
      if (p.popup) m.setPopup(new maplibregl.Popup({ offset: 16 }).setHTML(p.popup));
      if (p.draggable && p.onDrag)
        m.on('dragend', () => { const ll = m.getLngLat(); p.onDrag({ lat: ll.lat, lng: ll.lng }); });
      _active.push(m);
    });
    if (list.length > 1) {
      const b = list.reduce((b, p) => b.extend([p.lng, p.lat]),
        new maplibregl.LngLatBounds([list[0].lng, list[0].lat], [list[0].lng, list[0].lat]));
      map.fitBounds(b, { padding: 60, maxZoom: 15 });
    }
  }

  map.on('error', (e) => {
    if (e.error && String(e.error).includes('404')) {
      map.remove();
      el.innerHTML = '<div class="map-fallback">Map tiles not found. Run <code>npm run get-map</code> in the terminal, then reload this page.</div>';
    }
  });

  map.on('load', () => {
    _loaded = true;
    _applyMarkers(_pending !== null ? _pending : markers);
    _pending = null;

    if (onPickup || onDrop) {
      let pickSet = false, dropSet = false;
      map.getCanvas().style.cursor = 'crosshair';
      map.on('click', e => {
        const p = { lat: e.lngLat.lat, lng: e.lngLat.lng };
        if (!pickSet)      { pickSet = true; onPickup && onPickup(p); }
        else if (!dropSet) { dropSet = true; onDrop   && onDrop(p);   }
      });
    }
  });

  return {
    setMarkers(list) { if (_loaded) _applyMarkers(list); else _pending = list; },
    get map() { return map; },
    remove() { map.remove(); },
  };
}

// ── Theme toggle ─────────────────────────────────────────────────────────────
function _isDark() {
  const t = document.documentElement.dataset.theme;
  return t ? t === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
}
function toggleTheme() {
  const next = _isDark() ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem('theme', next); } catch {}
  _updateThemeBtn();
}
function _updateThemeBtn() {
  const btn = document.getElementById('theme-btn');
  if (btn) btn.textContent = _isDark() ? 'Light mode' : 'Dark mode';
}
(function initTheme() {
  try { const s = localStorage.getItem('theme'); if (s) document.documentElement.dataset.theme = s; } catch {}
  _updateThemeBtn();
})();
