# Testing

- `npm test` runs 35 tests: pricing (petrol vs electric, caps, range), rules (state machine, batching, hotspots, ledger), full order flow, HTTP API.
- `npm run simulate` runs a seeded full day (70 orders, 12 drivers) and prints parcels delivered, saving vs solo, and whether the ledger balanced.
- CI (`.github/workflows/test.yml`) runs both on every push and pull request.
- A change is acceptable only if: tests pass, simulator ledger is balanced, and new rules have a test.
- Before pilot: add tests for payment webhooks (bad signature, duplicate event), OTP login (wrong code, expiry), and rate limits.
- Money checks to keep: every ledger transaction sums to zero; escrow after delivery is zero; refunds due equal cap minus price.
