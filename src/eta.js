// ETA is an honest estimate, not a promise: distance / speed + dwell, shown as a +/- window.
const { haversineKm } = require('./geo');

function etaMinutes(region, vehicleId, from, stopsBefore, to) {
  const v = region.vehicles[vehicleId], p = region.pricing;
  let km = 0, cur = from;
  for (const s of [...stopsBefore, to]) { km += haversineKm(cur, s) * p.roadFactor; cur = s; }
  return Math.round((km / v.speedKmh) * 60 + stopsBefore.length * p.dwellMinutes);
}

function window(nowMs, minutes, halfWidth = 20) {
  const mid = nowMs + minutes * 60000, w = halfWidth * 60000;
  return { from: mid - w, to: mid + w, mid };
}

/** Notify the customer only when the new estimate moved by `thresholdMin` or more. */
function shouldNotify(prevMid, newMid, thresholdMin = 30) { return prevMid == null || Math.abs(newMid - prevMid) >= thresholdMin * 60000; }

module.exports = { etaMinutes, window, shouldNotify };
