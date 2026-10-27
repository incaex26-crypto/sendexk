// Pricing: everything is computed from the vehicle that does the run.
//   driverCost = energy + wear + time + handling
//   runPrice   = driverCost / (1 - platformShare)
// Money is whole cents everywhere.
const { pathKm } = require('./geo');

const cents = (rand) => Math.round(rand * 100);
const CLASS_OF = (id) => (id.startsWith('motorbike') ? 'bike' : id.startsWith('car') ? 'car' : 'van');
const REFERENCE = { bike: 'motorbike', car: 'car', van: 'van' };

function vehicleClass(id) { return CLASS_OF(id); }
function referenceVehicle(cls) { return REFERENCE[cls]; }
function vehiclesOfClass(region, cls) { return Object.keys(region.vehicles).filter((v) => CLASS_OF(v) === cls); }

function energyCostCents(region, vehicleId, km) {
  const v = region.vehicles[vehicleId], p = region.pricing;
  const unit = v.energy === 'electric' ? p.electricityPerKwh : p.fuelPerLitre;
  return cents((v.per100 / 100) * km * unit);
}

/** Can this vehicle do `km` on one charge/tank with the safety reserve? */
function withinRange(region, vehicleId, km) {
  const v = region.vehicles[vehicleId];
  if (!v.rangeKm) return true;
  return km <= v.rangeKm * (1 - region.pricing.rangeReserve);
}

/**
 * Cost to the driver of a run. `km` = road km, `stops` = pickups + drop-offs.
 * Returns an itemised breakdown (the same one shown to drivers and admins).
 */
function driverCost(region, vehicleId, km, stops) {
  const v = region.vehicles[vehicleId], p = region.pricing;
  const minutes = (km / v.speedKmh) * 60 + stops * p.dwellMinutes;
  const energy = energyCostCents(region, vehicleId, km);
  const wear = cents(v.wearPerKm * km);
  const time = cents((minutes / 60) * p.hourlyRate);
  const handling = cents(p.handlingPerStop * stops);
  return { km: round(km, 2), stops, minutes: Math.round(minutes), energy, wear, time, handling, total: energy + wear + time + handling };
}

function round(n, d = 2) { const f = 10 ** d; return Math.round(n * f) / f; }

/** Run price given a plan tier. */
function runPrice(region, cost, tier = 'standard') {
  const share = region.pricing.platformShare[tier];
  return Math.ceil(cost.total / (1 - share));
}

/** Split a run price across parcels. Each parcel pays an equal share plus extras, never below the floor. */
function parcelPrices(region, run, parcels, tier = 'standard') {
  const p = region.pricing, n = parcels.length;
  const base = Math.ceil(runPrice(region, run, tier) / n);
  return parcels.map((x) => {
    const outer = x.outer ? cents(p.outerZoneFee) : 0;
    const msg = cents(p.messagingPerParcel);
    return Math.max(cents(p.minParcelPrice), base) + outer + msg;
  });
}

/** Fixed route for a single parcel on its own (pickup -> drop). Used for the cap. */
function soloRun(region, vehicleId, pickup, drop) {
  const km = pathKm([pickup, drop], region.pricing.roadFactor);
  return driverCost(region, vehicleId, km, 2);
}

/**
 * Quote shown at booking time.
 *  - cap:   what a parcel costs if it travels alone (the most the business can ever pay)
 *  - low:   what it costs when the run fills up (indicative)
 * Individuals are charged the cap up-front and refunded any difference (open decision, switchable).
 */
function quote(region, { pickup, drop, vehicleClass, outer = false }, tier = 'standard') {
  const ref = referenceVehicle(vehicleClass);
  const solo = soloRun(region, ref, pickup, drop);
  const p = region.pricing;
  const extras = (outer ? cents(p.outerZoneFee) : 0) + cents(p.messagingPerParcel);
  const cap = Math.max(cents(p.minParcelPrice), runPrice(region, solo, tier)) + extras;
  const fullRun = Math.min(region.vehicles[ref].maxStops / 2, 8);
  const low = Math.max(cents(p.minParcelPrice), Math.ceil(runPrice(region, solo, tier) / fullRun)) + extras;
  return { cap, low: Math.min(low, cap), vehicleClass, refVehicle: ref, soloKm: solo.km, breakdown: solo };
}

/**
 * Judge a proposed run. Platform take = revenue - driver payout - messaging cost.
 * Revenue is capped per parcel (what the business agreed never to exceed).
 */
function evaluateRun(region, vehicleId, route, parcels, tier = 'standard') {
  const p = region.pricing;
  const km = pathKm(route, p.roadFactor);
  const cost = driverCost(region, vehicleId, km, route.length);
  const raw = parcelPrices(region, cost, parcels, tier);
  const prices = raw.map((x, i) => Math.min(x, parcels[i].capCents ?? Infinity));
  const revenue = prices.reduce((a, b) => a + b, 0);
  const msgCost = parcels.length * cents(p.messagingPerParcel);
  const share = p.platformShare[tier];
  const payout = Math.max(cost.total, Math.round((revenue - msgCost) * (1 - share)));
  const take = revenue - payout - msgCost;
  const reasons = [];
  if (parcels.length < p.minParcelsPerRun && take < cents(p.minProfitPerRun)) reasons.push('too few parcels');
  if (take < cents(p.minProfitPerRun) && parcels.length >= p.minParcelsPerRun) reasons.push('platform take below minimum');
  if (payout < cost.total) reasons.push('driver would lose money');
  if (!withinRange(region, vehicleId, km)) reasons.push('beyond vehicle range');
  return { km: cost.km, minutes: cost.minutes, cost, prices, revenue, payout, take, ok: reasons.length === 0, reasons };
}

module.exports = {
  cents, vehicleClass, referenceVehicle, vehiclesOfClass, energyCostCents, withinRange,
  driverCost, runPrice, parcelPrices, quote, evaluateRun, soloRun,
};
