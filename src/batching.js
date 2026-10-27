// Batching: confirmed parcels -> candidate runs. Pure function, no DB access.
//  1. group by vehicle class
//  2. cluster delivery zones that are within mergeKm of each other (outer zones stay alone)
//  3. split clusters by stop and weight limits
//  4. sequence pickups then drops (nearest neighbour)
//  5. profit check with the class' reference vehicle; unprofitable runs are held back
const { haversineKm, sequence, nearestZone } = require('./geo');
const P = require('./pricing');

function clusterZones(region, parcels) {
  const zoneIds = [...new Set(parcels.map((p) => p.zone))];
  const z = (id) => region.zones.find((x) => x.id === id);
  const groups = [];
  for (const id of zoneIds) {
    const zone = z(id);
    const g = !zone.outer && groups.find((g) => !g.outer && haversineKm(g.seed, zone) <= region.pricing.mergeKm);
    if (g) g.ids.push(id); else groups.push({ seed: zone, ids: [id], outer: !!zone.outer });
  }
  return groups.map((g) => g.ids);
}

function build(region, parcels, tier = 'standard') {
  const runs = [], held = [];
  const byClass = {};
  for (const p of parcels) (byClass[p.vehicleClass] ||= []).push(p);
  for (const [cls, list] of Object.entries(byClass)) {
    const ref = P.referenceVehicle(cls), v = region.vehicles[ref];
    for (const zones of clusterZones(region, list)) {
      const group = list.filter((p) => zones.includes(p.zone)).sort((a, b) => a.id - b.id);
      let chunk = [], kg = 0, stops = 0;
      const flush = () => { if (chunk.length) { evaluate(chunk); chunk = []; kg = 0; stops = 0; } };
      for (const p of group) {
        const addFor = () => 1 + (chunk.some((c) => c.pickup.lat === p.pickup.lat && c.pickup.lng === p.pickup.lng) ? 0 : 1);
        if (stops + addFor() > v.maxStops || kg + p.weightKg > v.maxKg) flush();
        const add = addFor();
        chunk.push(p); kg += p.weightKg; stops += add;
      }
      flush();
    }
    function evaluate(chunk) {
      const route = routeFor(chunk);
      const ev = P.evaluateRun(region, ref, route.points, chunk, tier);
      // Try dropping the least profitable-looking outlier once before giving up.
      if (!ev.ok && chunk.length > region.pricing.minParcelsPerRun) {
        const far = [...chunk].sort((a, b) => haversineKm(b.drop, chunk[0].drop) - haversineKm(a.drop, chunk[0].drop))[0];
        const rest = chunk.filter((x) => x !== far), r2 = routeFor(rest);
        const e2 = P.evaluateRun(region, ref, r2.points, rest, tier);
        if (e2.ok) { held.push({ parcels: [far], reasons: ['outlier held for next round'] }); return runs.push(make(cls, ref, rest, r2, e2)); }
      }
      if (ev.ok) runs.push(make(cls, ref, chunk, route, ev)); else held.push({ parcels: chunk, reasons: ev.reasons, eval: ev });
    }
  }
  return { runs, held };
}

function routeFor(chunk) {
  const pickups = [];
  for (const p of chunk) if (!pickups.some((q) => q.lat === p.pickup.lat && q.lng === p.pickup.lng)) pickups.push(p.pickup);
  const start = pickups[0];
  const pOrdered = [start, ...sequence(start, pickups.slice(1))];
  const lastPick = pOrdered[pOrdered.length - 1];
  const drops = sequence(lastPick, chunk.map((p) => ({ ...p.drop, id: p.id })));
  return { points: [...pOrdered, ...drops], pickups: pOrdered, drops };
}

function make(cls, ref, chunk, route, ev) {
  return {
    vehicleClass: cls, refVehicle: ref, parcels: chunk.map((p) => p.id),
    route: route.points, pickups: route.pickups, drops: route.drops.map((d) => d.id),
    km: ev.km, minutes: ev.minutes, revenue: ev.revenue, payout: ev.payout, take: ev.take, prices: ev.prices,
  };
}

module.exports = { build, routeFor };
