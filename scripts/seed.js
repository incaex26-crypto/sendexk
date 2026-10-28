// Fills data/app.db with a morning's worth of data so the admin/driver pages have something to show.
const path = require('node:path'), fs = require('node:fs');
const { open } = require('../src/db'), S = require('../src/service'), sim = require('../src/sim'), clock = require('../src/clock');
const file = path.join(__dirname, '..', 'data', 'app.db');
for (const f of [file, file + '-wal', file + '-shm']) if (fs.existsSync(f)) fs.rmSync(f);
const db = open(file), region = S.loadRegions(db)['za-jhb'];
const world = sim.populate(db, region, 11);
const orders = sim.bookOrders(db, region, world, 40);
sim.confirmOrders(db, region, world, orders);
clock.reset();
console.log(`Seeded ${orders.length} orders, ${world.drivers.length} drivers (log in on the driver page with phone 0710000000, ${world.drivers[0].name}). Clock reset to now.`);
console.log('Note: dates in the DB are from the simulated day; run `node scripts/simulate.js` to see a full day end to end.');
