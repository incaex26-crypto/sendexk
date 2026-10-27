# Project brief

**Idea:** a web-first same-day delivery marketplace for independent drivers in dense urban areas. Supports person-to-person, business-to-person, person-to-business and business-to-business. Not for sparse areas.

**First area:** Johannesburg north (Sandton, Rosebank, Bryanston, Randburg, Fourways; Midrand as an outer zone). Exact pilot suburbs and first businesses are **still to be chosen by the user**.

## How a day works
- Bookings are taken until the booking cut-off (09:30). Later bookings move to the next day.
- Every recipient gets a one-tap link to confirm a map pin (or use GPS) and a delivery code. **Unconfirmed parcels are never collected.** They roll to the next day and expire after about 3 days (sender refunded).
- At the confirmation cut-off (11:00) the system batches confirmed parcels by vehicle class and zone. Runs that would lose money are held back.
- Drivers see runs priced for **their own vehicle** (petrol or electric motorbike, car, van) and accept one. First accept wins.
- Collection, out-for-delivery (customer sees an ETA window), delivery with the recipient's code. Failed delivery returns to sender the same day in the pilot.

## Money
- Price = driver cost (energy per km, wear, time, handling) divided by (1 - platform share). Shared across parcels, so more parcels per run means cheaper parcels.
- Businesses see a range and pay actual from a prepaid wallet, never above the cap. Individuals pay a firm price per vehicle class at booking. Stores with websites: the shopper pays us on a link (pilot default) or the store pays from its wallet. See `03_DECISIONS.md`.
- Driver plans: Standard (higher platform share) or a 30-day prepaid **Pro pass** (lower share, first pick). No auto-renew.
- Hotspots are automatic (demand minus drivers per ~2 km cell) with small capped bonuses.
- Ledger in whole cents; weekly payouts with a short holdback.

## Not doing (settled)
Own insurance pool, storage hosts or hubs, shopper feature, stock-aware slots, in-app turn-by-turn navigation. Uninsured by default with liability caps and banned items.

## Plug-ins (later)
WooCommerce first (shipping method returning delivery slots), Shopify later (needs carrier-calculated shipping access). For businesses with and without online stores, and individuals.

## Related documents
The earlier spec-by-spec plan (18 specs) was written as a Claude Doc: https://claude.ai/artifact/5oJLHmxFiDzgc9G9TRzTpZ . The interactive demo: https://claude.ai/artifact/KaXtyMWc5ruwVtk3qS6Zt6 .
