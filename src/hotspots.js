// Automatic hotspots: no one draws them. Demand minus supply per ~2 km cell.
//   score = max(0, demand + w*forecast - drivers * perDriver)
// Smoothed (exponential) so they don't flicker; bonus is capped per day.
const { cellOf, cellCenter } = require('./geo');

/**
 * demandPoints: pickups of confirmed parcels + business locations (weights)
 * driverPoints: recent driver pings + the "I'll work here today" pins
 * forecast: map cell -> expected extra parcels (e.g. last same weekday), optional
 * prev: previous scores for smoothing
 */
function compute(region, { demandPoints = [], driverPoints = [], forecast = {}, prev = {}, alpha = 0.6 }) {
  const h = region.hotspots, demand = {}, supply = {};
  for (const d of demandPoints) { const c = cellOf(region, d); demand[c] = (demand[c] || 0) + (d.w ?? 1); }
  for (const d of driverPoints) { const c = cellOf(region, d); supply[c] = (supply[c] || 0) + 1; }
  const cells = new Set([...Object.keys(demand), ...Object.keys(supply), ...Object.keys(forecast)]);
  const out = [];
  for (const c of cells) {
    const raw = Math.max(0, (demand[c] || 0) + h.forecastWeight * (forecast[c] || 0) - (supply[c] || 0) * h.perDriver);
    const score = alpha * raw + (1 - alpha) * (prev[c] || 0);
    if (score >= h.minGap) out.push({ cell: c, score: Math.round(score * 100) / 100, demand: demand[c] || 0, drivers: supply[c] || 0, ...cellCenter(region, c) });
  }
  return out.sort((a, b) => b.score - a.score);
}

/** Bonus (cents) for a driver who accepts a run starting inside a hot cell. Capped by daily budget. */
function bonusFor(region, hot, point, spentToday = 0) {
  const c = cellOf(region, point), found = hot.find((x) => x.cell === c);
  if (!found) return 0;
  const room = Math.max(0, region.hotspots.dailyBonusCap * 100 - spentToday);
  const level = Math.min(1, found.score / 6);
  return Math.min(room, Math.round(region.hotspots.bonus * 100 * level));
}
module.exports = { compute, bonusFor };
