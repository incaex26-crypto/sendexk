# Decisions

## Settled (do not re-open without the user asking)

- Normal courier-style same-day delivery; no shopper feature; no hubs or storage hosts; no own insurance pool.
- Recipient confirms a map pin before collection; their pin is the delivery address.
- Roll-over: unconfirmed parcels move to next day; cancel and refund after about 3 days.
- Price from the accepting vehicle (fuel L/100km or electric kWh/100km, wear, time, handling). Petrol and electric motorbikes, cars and vans supported.
- Business sees range and cap, pays actual up to the cap.
- Driver plans: Standard vs prepaid 30-day Pro pass (no auto-renew).
- Failed delivery in pilot: same-day return to sender.
- Maps: own tiles (PMTiles + MapLibre), no in-app navigation. Distances: haversine now, OSRM later behind one function.
- Hotspots are automatic, never drawn by hand.
- New city must be plug-and-play via a region config file.
- Build with zero production dependencies (Node 24 + built-in SQLite).
- **Platform name (2026-10-26):** SenDexk. Still to do: check the name is free (company registry, domain, trademark, app stores, social handles) before spending money on branding.

**Payment models (2026-10-26).** Three payers, one delivery engine:
1. *Individual, no store:* pays SenDexk at booking, before pickup, a **firm price per vehicle class**.
2. *Business without a website:* **prepaid wallet** (top up by card/EFT, optional auto top-up). A parcel is dispatched only if the wallet covers its cap. Charged the actual price, never above the cap. No credit in the pilot.
3. *Store with a website (plug-in):* two modes. **Default for the pilot: customer pays on our link.** The shopper pays the store for goods, picks SenDexk as delivery, gets our link, confirms address and pin, sees our firm price next to the store's own delivery rate, and pays us. Paying = confirming. Fallback to the store's normal carrier if unpaid after a store-set window (default 30 min). **Second mode: store pays from its wallet** and shows the shopper its own delivery price (the store keeps any margin).

- **Price comparison** uses the store's own configured shipping rates only. Never invent competitor prices. Wording to be legally checked.
- **Price at checkout from the typed address**, pin confirmed after the order. If the pin moves far from the address, adjust the price slightly or ask the shopper to approve.
- **Price ceiling:** a per-region setting `maxParcelPrice` (start R100, unverified). Parcels that cannot be served below it are not offered same-day unless batched.
- **Stop time depends on distance between stops:** about 30 m or less (same building/yard) = one stop, small extra time per added parcel; 30–150 m = separate stops with walking time and reduced base time; over 150 m = full time each. Starting values to be tuned with real driver timings. Never merge on distance alone when address text disagrees; use road distance once routing exists.
- **Pickups at the same address are one stop.** Pay the driver for the real route and show him the run total before he accepts. Driver pay never falls below the run's real cost (energy, wear, time at hourly rate, handling).
- **Pricing principle:** firm prices for customers; pay drivers for the real work; the difference on shared stops is ours where the customer price is firm; where the business pays actual, the saving is passed on. Earn through volume. Do not raise prices to capture savings. Watch driver pay per hour in the pilot.
- **Delivery model:** scheduled same-day batches (booking cut-off at 09:30, recipients confirm a pin, batched at 11:00). The current screens show "Now, by 15:10" on-demand style. **Recommended answer:** pilot with scheduled windows only; add on-demand after the first pilot cohort.

## Proposed (NOT yet decided; do not build until the user confirms)

- **Slots as a product:** businesses reserve daily pickup slots (monthly reservation fee, fee for unused slots, later cut-off for a fee, Friday/month-end premium, priority tier where Pro drivers pick first). Pilot: sell "priority", not "guaranteed", until the driver pool can honour it.
- **Killer feature:** because recipients confirm first, offer confirmed arrival windows (1-hour premium) and brand on near-zero failed deliveries. Flex pricing: 4-hour window cheapest, 2-hour standard, 1-hour premium. Falling price as neighbours join a run.
- **More revenue ideas:** store-branded tracking page with paid promo space; reverse pickups (returns); parcel-cover add-on through a licensed partner (commission only); anonymised delivery insights (needs privacy check); shopper plan; paid same-day driver payouts.
- **Interface direction:** a "departures board" look (route, time, seats left, price) instead of generic app cards. Prototype before committing.

## Open (ask the user; do not guess)

1. Real address search provider (typing a street address)?  
   *Recommended: keep suburb list and map pins for the pilot; evaluate a hosted geocoder with a free tier for South African addresses after the pilot starts.*
2. Real payment provider?  
   *Recommended: compare two or three that support South African cards and instant EFT; pick on fees and onboarding speed. Needs a registered business.*
3. Real SMS provider for driver login?  
   *Recommended: get quotes from two providers; start with one, keep email fallback.*
4. Platform share percentage and Pro price?  
   *Recommended: keep placeholder values until the 10-store rate check below is done.*
5. First pilot suburbs and first five businesses?  
   *Recommended: the two densest suburbs from the hotspot map plus five bakeries, florists or pharmacies within 10 km of each other.*
6. EV incentive: cost-based pay makes EV drivers earn less per hour in the simulator. Accept, or add a small EV bonus?
7. Payment provider legal check: prepaid wallets and customer-paid links mean holding customer money; check whether provider split payments avoid this. Also whether card fees come back on refunds.
8. Driver status (independent contractor) and liability caps: legal review needed.
9. Who builds it: user + Claude agents only, or a hired developer later?
10. Does a typical South African store really cap delivery near R100? Fill the table below from 10 live store checkouts.
11. How much, if anything, to pay stores per delivery when the shopper pays on our link (stores lose shipping margin)?
12. Default unpaid-link window before falling back to the store's carrier (30 min proposed)?
13. Merge distance values (30 m / 150 m) to be tuned with real drivers?
14. POPIA: privacy notice, consent records, data export/delete — needed before any real users.
15. Terms of service, prohibited items list, courier/transport rules compliance.
16. Proof of delivery: real photo storage backend (file_ref in `driver_documents` is a placeholder — needs S3 or similar).
17. Store plugins: real WooCommerce/Shopify OAuth flow (current endpoint is a spec placeholder).
18. B8: Invoice and VAT generation for business customers.
19. B9: Daily reconciliation report for finance.
20. Pilot playbook: step-by-step guide for the first 5 businesses (I2).

## Store delivery-rate check (user task, about 1 hour)

Purpose: test the belief that South African online stores cap delivery near R100, and see whether stores earn a margin on shipping. Do this before the price ceiling and store commission are fixed.

Pick 10 stores (mix of sizes, some WooCommerce, some Shopify). For each, put a Johannesburg-north item in the cart and read the delivery options at checkout. Then price the same parcel on the courier's own public website.

| # | Store | Platform | Parcel size/weight | Delivery fee (shopper) | Speed | Free over R? | Courier price (same parcel) | Courier used | Gap (shopper − courier) | Same-day offered? |
|---|-------|----------|--------------------|------------------------|-------|--------------|-----------------------------|--------------|-------------------------|-------------------|
| 1 | | | | | | | | | | |
| 2 | | | | | | | | | | |
| 3 | | | | | | | | | | |
| 4 | | | | | | | | | | |
| 5 | | | | | | | | | | |
| 6 | | | | | | | | | | |
| 7 | | | | | | | | | | |
| 8 | | | | | | | | | | |
| 9 | | | | | | | | | | |
| 10 | | | | | | | | | | |

How to read it: a gap above zero means the store earns on shipping (it may resist losing that). A fee near R100 on most rows supports the R100 ceiling. Any store already offering same-day tells us who we compete with.  
When done, give the filled table to the agent: "Update decisions 10 and 11 in docs/DECISIONS.md."

## Log

- 2026-10-26: Repository plan created; starter code, demo and docs written.
- 2026-10-26: User chose the platform name SenDexk.
- 2026-10-26: Settled payment models, firm price for individuals, price ceiling setting, stop-time-by-distance rule, driver paid for real route, pricing principle.
- 2026-10-29: feat/skeleton merged (PR #15): business OTP, API keys, payments interface, full UI rebuild, 18 screenshots.
- 2026-10-29: feat/spec-coverage open (PR #16): driver onboarding, cancellations, weekly statements, disputes, settings editor, store plugin spec, 165 tests.
- 2026-10-29: Repo tidy (chore/tidy-docs): docs consolidated from 17 files to 4.
