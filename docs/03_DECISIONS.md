# Decisions

## Settled (do not re-open without the user asking)
- Normal courier-style same-day delivery; no shopper feature; no hubs or storage hosts; no own insurance pool.
- Recipient confirms a map pin before collection; their pin is the delivery address.
- Roll-over: unconfirmed parcels move to next day; cancel and refund after about 3 days.
- Price from the accepting vehicle (fuel L/100km or electric kWh/100km, wear, time, handling). Petrol and electric motorbikes and cars supported.
- Business sees range and cap, pays actual up to the cap.
- Driver plans: Standard vs prepaid 30-day Pro pass (no auto-renew).
- Failed delivery in pilot: same-day return to sender.
- Maps: own tiles (PMTiles + MapLibre), no in-app navigation. Distances: haversine now, OSRM later behind one function.
- Hotspots are automatic, never drawn by hand.
- New city must be plug-and-play via a region config file.
- Build with zero dependencies where possible (Node 22 + built-in SQLite).

- **Payment models (2026-10-26).** Three payers, one delivery engine:
  1. *Individual, no store:* pays SenDexk at booking, before pickup, a **firm price per vehicle class**.
  2. *Business without a website:* **prepaid wallet** (top up by card/EFT, optional auto top-up). A parcel is dispatched only if the wallet covers its cap. Charged the actual price, never above the cap. No credit in the pilot.
  3. *Store with a website (plug-in):* two modes. **Default for the pilot: customer pays on our link.** The shopper pays the store for goods, picks SenDexk as delivery, gets our link, confirms address and pin, sees our firm price next to the store's own delivery rate, and pays us. Paying = confirming. Fallback to the store's normal carrier if unpaid after a store-set window (default 30 min). **Second mode: store pays from its wallet** and shows the shopper its own delivery price (the store keeps any margin).
- **Price comparison** uses the store's own configured shipping rates only (read by the plug-in). Never invent competitor prices. Wording to be legally checked.
- **Price at checkout from the typed address**, pin confirmed after the order. If the pin moves far from the address, adjust the price slightly or ask the shopper to approve.
- **Price ceiling:** a per-region setting `maxParcelPrice` (start R100, unverified: user observes South African stores cap delivery near R100). Parcels that cannot be served below it are not offered same-day unless batched.
- **Stop time depends on distance between stops:** about 30 m or less (same building/yard) = one stop, small extra time per added parcel; 30-150 m = separate stops with walking time and reduced base time; over 150 m = full time each. Starting values to be tuned with real driver timings. Never merge on distance alone when address text or complex name disagrees; use road distance once routing exists.
- **Pickups at the same address are one stop.** Pay the driver for the real route and show him the run total before he accepts. Driver pay never falls below the run's real cost (energy, wear, time at hourly rate, handling).
- **Pricing principle:** firm prices for customers; pay drivers for the real work; the difference on shared stops is ours where the customer price is firm; where the business pays actual, the saving is passed on. Earn through volume. Do not raise prices to capture savings. Watch driver pay per hour in the pilot.

## Proposed ideas (raised 2026-10-26, NOT yet decided; do not build until the user confirms)
- **Slots as a product:** businesses reserve daily pickup slots (monthly reservation fee, fee for unused slots, later cut-off for a fee, Friday/month-end premium, priority tier where Pro drivers pick first). Pilot: sell "priority", not "guaranteed", until the driver pool can honour it.
- **Killer feature: "delivery that leaves only when you're home".** Because recipients confirm first, offer confirmed arrival windows (1-hour premium) and brand on near-zero failed deliveries. Flex pricing: 4-hour window cheapest, 2-hour standard, 1-hour premium. Falling price as neighbours join a run.
- **More revenue ideas:** store-branded tracking page with paid promo space; reverse pickups (returns); parcel-cover add-on through a licensed partner (commission only, needs a partner); anonymised delivery insights (needs privacy check); shopper plan; paid same-day driver payouts.
- **Interface direction:** a "departures board" look (route, time, seats left, price) instead of generic app cards. Prototype before committing.

## Open (ask the user; do not guess)
1. ~~Platform name~~ SETTLED 2026-10-26: **SenDexk**. Still to do: check the name is free (company registry, domain, trademark, app stores, social handles) before spending money on branding.
2. ~~Individuals' pricing~~ SETTLED: firm price per vehicle class.
3. Pilot suburbs and first 5 businesses.
4. Real platform share values (18% / 10% are illustrative) and Pro pass price (R299 illustrative).
5. How hotspot bonuses are funded and their daily cap.
6. Payment provider choice (Paystack vs PayFast). Legal check: prepaid wallets and customer-paid links mean holding customer money; check whether provider split payments avoid this. Also whether card fees come back on refunds.
7. Driver status (independent contractor) and liability caps: legal review needed.
8. Electric-vehicle incentive: cost-based pay makes EV drivers earn less per hour in the simulator. Accept, or add a small EV bonus?
9. Who builds it: user + Claude agents only, or a hired developer later?

## Log
- 2026-10-26: Repository plan created; starter code, demo and docs written.
- 2026-10-26: User chose the platform name SenDexk.
- 2026-10-26: Settled payment models, firm price for individuals, price ceiling setting, stop-time-by-distance rule, driver paid for real route, pricing principle.

## New open items from this session
10. Does a typical South African store really cap delivery near R100? Check about 10 stores against published courier rates (table to be filled by the user).
11. How much, if anything, to pay stores per delivery when the shopper pays on our link (stores lose shipping margin).
12. Default unpaid-link window before falling back to the store's carrier (30 min proposed).
13. Merge distance values (30 m / 150 m) to be tuned with real drivers.
14. Address search provider (geocoder): the booking page currently lets the user click the map or choose a suburb. When typed address search is needed, which provider? Options: Nominatim/OpenStreetMap (free, no key, slower), Photon (free, no key, OSM-based), Google Places (accurate for SA, costs per request), Pelias self-hosted (no cost per request, needs a server). No decision made — address search is not wired to any external API yet.
