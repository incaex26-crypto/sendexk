const { open } = require('../src/db'), S = require('../src/service'), { runDay } = require('../src/sim');
const seed = Number(process.argv[2] || 7), n = Number(process.argv[3] || 70);
const db = open(':memory:'), region = S.loadRegions(db)['za-jhb'];
const rep = runDay(db, region, { seed, orders: n });
console.log(JSON.stringify(rep, null, 2));
require('node:fs').mkdirSync(require('node:path').join(__dirname, '..', 'data'), { recursive: true });
require('node:fs').writeFileSync(require('node:path').join(__dirname, '..', 'data', 'sim-report.json'), JSON.stringify(rep, null, 2));
