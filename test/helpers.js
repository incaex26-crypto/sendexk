process.env.DEV = '1'; // tests run like npm run dev, so fake-channel OTP codes are visible
const { open } = require('../src/db');
const S = require('../src/service');
const clock = require('../src/clock');
function setup(iso = '2026-10-26T06:30:00Z') { // 08:30 in Johannesburg
  clock.set(Date.parse(iso));
  const db = open(':memory:'), regions = S.loadRegions(db), region = regions['za-jhb'];
  return { db, region };
}
const P = {
  sandton: { lat: -26.107, lng: 28.056 }, rosebank: { lat: -26.145, lng: 28.041 }, bryanston: { lat: -26.058, lng: 28.020 },
  randburg: { lat: -26.094, lng: 27.994 }, midrand: { lat: -25.990, lng: 28.130 },
};
function order(S_, db, region, over = {}) {
  const jit = (n) => (Math.random() - 0.5) * n;
  const base = { vehicleClass: 'car', weightKg: 3, category: 'parcel', sender: { name: 'Shop', phone: '0820000000' }, recipient: { name: 'Sam', phone: '0830000000' },
    pickup: { ...P.sandton, address: 'Shop' }, drop: { lat: P.rosebank.lat + jit(0.01), lng: P.rosebank.lng + jit(0.01), address: 'Home' } };
  return S_.createOrder(db, region, { ...base, ...over });
}
module.exports = { setup, P, order };
