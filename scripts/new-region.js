// Usage: node scripts/new-region.js <id> "<Name>" <lat> <lng> [timezone] [currency] [countryCode]
// Copies the Johannesburg config, re-centres it and lays out a starter zone ring. Edit prices before launch.
const fs = require('node:fs'), path = require('node:path');
const [id, name, lat, lng, tz = 'UTC', cur = 'USD', country = 'XX'] = process.argv.slice(2);
if (!id || !name || !lat || !lng) { console.error('usage: new-region <id> "<Name>" <lat> <lng> [tz] [currency] [country]'); process.exit(1); }
const dir = path.join(__dirname, '..', 'config', 'regions'), out = path.join(dir, `${id}.json`);
if (fs.existsSync(out)) { console.error(`${out} already exists`); process.exit(1); }
const base = JSON.parse(fs.readFileSync(path.join(dir, 'za-jhb.json'), 'utf8')), c = { lat: +lat, lng: +lng };
base.id = id; base.name = name; base.phone = { countryCode: 'SET_ME', trunkPrefix: '0' }; base.status = 'draft'; base.country = country; base.timezone = tz; base.currency = cur; base.center = c;
const ring = [[0, 0, 'Centre'], [0.04, 0, 'North'], [-0.04, 0, 'South'], [0, 0.04, 'East'], [0, -0.04, 'West'], [0.1, 0.1, 'Outer NE']];
base.zones = ring.map(([a, b, n], i) => ({ id: n.slice(0, 3).toUpperCase() + i, name: n, lat: +(c.lat + a).toFixed(4), lng: +(c.lng + b).toFixed(4), outer: i === 5 }));
base.pricing._note = 'COPIED FROM za-jhb - REPLACE EVERY VALUE with local fuel, electricity, wages before launch.';
fs.writeFileSync(out, JSON.stringify(base, null, 2) + '\n');
console.log(`Created ${out} (status: draft).\nChecklist: 1) real zones  2) local prices  3) cut-off times  4) banned items  5) phone.countryCode (e.g. 27)  6) restart server  7) pilot with 5 businesses, 10 drivers.`);
