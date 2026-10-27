# Roadmap. Each phase ends with "Done when".

**Phase 0: Set-up (user + Claude).** Repo on GitHub, Claude connected, first `/pickup` works, CI green. *Done when:* a pull request from Claude is merged with a green check.

**Phase 1: Make the core real.** Driver and admin login (phone OTP), payments sandbox (Paystack or PayFast test mode, webhook with signature check), message sending (SMS/WhatsApp sandbox), input validation, rate limiting, basic audit screen. *Done when:* a full order runs end to end in test mode with no mocks, and the tests cover failure paths.

**Phase 1b: Money models and pricing rules** (after login and payments sandbox).
Build: (a) `maxParcelPrice` region setting and the "not offered" rule; (b) stop-time by distance (30 m / 150 m, in config) with tests: three parcels in one building cost less than three separate stops, and a stop 100 m away is never free; (c) pay driver for the real route and show total at accept (already partly true: confirm and extend tests); (d) business **wallet** in the ledger (top-up, hold cap, release, refund); (e) **customer-pays-link flow**: order arrives unpaid from a store, link with pin and price comparison, payment confirms the order, timeout falls back; (f) firm price for individuals at booking. *Done when:* each of the three payer types completes an order in test mode and the ledger balances.

**Phase 2: Maps.** Region `map` config; PMTiles extract of the pilot area; MapLibre replaces the schematic map on booking, confirm, driver and admin pages; geocoder with confidence level and "confirm on map". See `05_MAPS_GUIDE.md`. *Done when:* a recipient can drop a pin on a real map on a phone and the pin is saved.

**Phase 3: Routing and ETA.** OSRM (or hosted router) behind `roadKm`; real distances in pricing; ETA from routes. *Done when:* simulator results move by less than expected and pricing tests still pass.

**Phase 4: Pilot ops.** Real prices from measured costs; 5 businesses and 10 drivers; support screen; payout run; daily report. *Done when:* two weeks of pilot with no ledger errors.

**Phase 5: Plug-ins.** WooCommerce shipping method first (rate from typed address, read the store's own rates for comparison, send order and open the pay-on-link flow); Shopify after (its checkout is closed, so use the post-purchase link). *Done when:* a test store can offer slots and create orders.

**Phase 6: Second city.** `npm run new-region`, local prices, launch gates. *Done when:* a second city runs from config alone.

Cross-cutting: tests for every rule; legal review before real money; privacy notice; backups.
