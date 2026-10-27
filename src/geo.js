// Geometry helpers. No map provider needed: haversine + a road factor is enough
// for pricing in dense areas. Swap `routeKm` for OSRM later behind the same signature.
const R = 6371;
const rad = (d) => (d * Math.PI) / 180;

function haversineKm(a, b) {
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function roadKm(a, b, roadFactor = 1.35) { return haversineKm(a, b) * roadFactor; }

/** Nearest-neighbour ordering of points, starting from `start`. Returns the ordered copy. */
function sequence(start, points) {
  const left = points.slice(), out = [];
  let cur = start;
  while (left.length) {
    let bi = 0, bd = Infinity;
    left.forEach((p, i) => { const d = haversineKm(cur, p); if (d < bd) { bd = d; bi = i; } });
    cur = left.splice(bi, 1)[0];
    out.push(cur);
  }
  return out;
}

/** Total road km along an ordered list of points. */
function pathKm(points, roadFactor = 1.35) {
  let km = 0;
  for (let i = 1; i < points.length; i++) km += roadKm(points[i - 1], points[i], roadFactor);
  return km;
}

function nearestZone(region, p) {
  let best = null, bd = Infinity;
  for (const z of region.zones) { const d = haversineKm(p, z); if (d < bd) { bd = d; best = z; } }
  return { zone: best, km: bd };
}

/** Is the point inside the service area? */
function inService(region, p) { return haversineKm(region.center, p) <= region.serviceRadiusKm; }

/** ~cellKm square grid id used for hotspots. */
function cellOf(region, p) {
  const kmLat = 111.2, kmLng = 111.2 * Math.cos(rad(region.center.lat));
  const cy = Math.floor(((p.lat - region.center.lat) * kmLat) / region.hotspots.cellKm);
  const cx = Math.floor(((p.lng - region.center.lng) * kmLng) / region.hotspots.cellKm);
  return `${cx}:${cy}`;
}
function cellCenter(region, id) {
  const [cx, cy] = id.split(':').map(Number), c = region.hotspots.cellKm;
  const kmLat = 111.2, kmLng = 111.2 * Math.cos(rad(region.center.lat));
  return { lat: region.center.lat + ((cy + 0.5) * c) / kmLat, lng: region.center.lng + ((cx + 0.5) * c) / kmLng };
}

module.exports = { haversineKm, roadKm, sequence, pathKm, nearestZone, inService, cellOf, cellCenter };
