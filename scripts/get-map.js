#!/usr/bin/env node
// Downloads the Johannesburg north PMTiles extract into data/maps/jhb.pmtiles.
// Requires the `pmtiles` CLI. If not installed, prints the exact commands to run.
const { execSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const BBOX = '27.83,-26.30,28.27,-25.90';
const MAXZOOM = 14;
const OUT = path.join(__dirname, '..', 'data', 'maps', 'jhb.pmtiles');

const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
const BUILD_URL = `https://build.protomaps.com/${today}.pmtiles`;

const which = spawnSync('which', ['pmtiles'], { stdio: 'pipe' });
if (which.status !== 0) {
  console.log('pmtiles CLI not found. Install it first, then run this script again.\n');
  console.log('Install (Linux x86_64 in a Codespace):');
  console.log('  curl -L https://github.com/protomaps/go-pmtiles/releases/latest/download/go-pmtiles_Linux_x86_64.tar.gz | tar xz pmtiles');
  console.log('  sudo mv pmtiles /usr/local/bin/\n');
  console.log('Or run the extract command directly:');
  console.log(`  pmtiles extract "${BUILD_URL}" "${OUT}" --bbox=${BBOX} --maxzoom=${MAXZOOM}`);
  process.exit(0);
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
console.log(`Extracting JHB north (bbox ${BBOX}) from ${BUILD_URL} ...`);
console.log(`Output: ${OUT}`);
try {
  execSync(`pmtiles extract "${BUILD_URL}" "${OUT}" --bbox=${BBOX} --maxzoom=${MAXZOOM}`, { stdio: 'inherit' });
  console.log('\nDone. Verify with: pmtiles show ' + OUT);
} catch {
  console.error('\nExtract failed. Run manually:');
  console.log(`  pmtiles extract "${BUILD_URL}" "${OUT}" --bbox=${BBOX} --maxzoom=${MAXZOOM}`);
  process.exit(1);
}
