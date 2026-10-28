#!/usr/bin/env node
// Stage 6: load every public page at phone (390px) and desktop (1280px),
// save screenshots to docs/screens/, and fail on console errors.
const { chromium } = require('playwright');
const { createApp } = require('../server');
const { setup } = require('../test/helpers');
const path = require('node:path');
const fs = require('node:fs');

const OUT = path.join(__dirname, '..', 'docs', 'screens');
fs.mkdirSync(OUT, { recursive: true });

const PAGES = [
  { name: 'booking',  url: '/' },
  { name: 'track',    url: '/track.html' },
  { name: 'driver',   url: '/driver.html' },
  { name: 'admin',    url: '/admin.html' },
  { name: 'confirm',  url: '/confirm.html' },
];
const WIDTHS = [390, 1280];

(async () => {
  const { db, region } = setup();
  const srv = createApp({ db, regions: { [region.id]: region } });
  await new Promise(r => srv.listen(0, r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const browser = await chromium.launch();
  let errors = 0;

  for (const width of WIDTHS) {
    for (const pg of PAGES) {
      const ctx = await browser.newContext({ viewport: { width, height: 800 } });
      const page = await ctx.newPage();
      const consoleErrors = [];
      page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
      page.on('pageerror', err => consoleErrors.push(String(err)));

      await page.goto(base + pg.url, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await page.waitForTimeout(1200); // let map render

      const fname = `${pg.name}-${width}.png`;
      await page.screenshot({ path: path.join(OUT, fname), fullPage: false });

      const relevant = consoleErrors.filter(e =>
        !e.includes('favicon') &&
        !e.includes('integrity') &&      // CDN blocked by no-network in tests
        !e.includes('Failed to fetch') && // tiles / CDN in headless
        !e.includes('net::ERR')
      );
      if (relevant.length) {
        console.error(`  ERRORS on ${pg.name} @ ${width}px:`);
        relevant.forEach(e => console.error('    ' + e));
        errors += relevant.length;
      } else {
        console.log(`  OK  ${fname}`);
      }
      await ctx.close();
    }
  }

  await browser.close();
  srv.close();

  if (errors > 0) {
    console.error(`\n${errors} console error(s) found. See above.`);
    process.exit(1);
  }
  console.log(`\nAll pages loaded without errors. Screenshots in docs/screens/`);
})();
