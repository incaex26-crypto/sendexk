# BLOCKED.md — features with stand-ins pending owner decisions

Each entry has a recommended answer. Owner to confirm or amend.

---

## E4: Store plugins (WooCommerce / Shopify)
**Stand-in**: `GET /api/store/plugin/woocommerce` returns the webhook spec and sample payload.
**Blocked by**: WooCommerce and Shopify OAuth credentials, plugin hosting, and app-store review.
**Recommended answer**: Start with the WooCommerce REST API plugin (no OAuth needed for self-hosted stores). Distribute as a `.zip` the merchant installs. Ship Shopify only after WooCommerce is validated with at least 3 pilot stores.

---

## D4: Proof of delivery photo
**Stand-in**: `POST /api/driver/scan/:id/photo` accepts a `photoRef` string and logs an event. No file is stored.
**Blocked by**: Decision on file storage provider (S3-compatible or local NAS).
**Recommended answer**: Use Cloudflare R2 (S3-compatible, no egress fees). Presigned upload URL from the server; driver app uploads direct. Store the object key, not the full URL, so the bucket can be moved.

---

## B8: Invoices and VAT
**Stand-in**: None. The ledger has all the data needed.
**Blocked by**: Decision on VAT registration timing and invoice number series.
**Recommended answer**: Register for VAT when turnover exceeds R1m (mandatory threshold). Until then, issue proforma invoices with "VAT Not Applicable". Build invoice generation on top of walletStatement — the ledger already has the data.

---

## B9: Daily reconciliation report
**Stand-in**: Admin overview shows ledger balance check (`ledgerBalanced: true/false`).
**Blocked by**: Decision on what external account to reconcile against (bank feed vs. payment provider statement).
**Recommended answer**: Pull the payment provider's daily CSV export and diff against `platform_revenue` + `escrow` accounts in the ledger. This can be a cron job that writes to `platform_settings` with key `reconciliation_YYYY-MM-DD`.

---

## H4: POPIA consent records
**Stand-in**: None.
**Blocked by**: Legal review of POPIA obligations for a courier marketplace.
**Recommended answer**: Collect explicit consent at account creation (checkbox + timestamp stored in `accounts`). Provide data export as JSON on request. Delete means set `status='deleted'` and null-out PII — do not hard-delete so ledger integrity is preserved.

---

## H5: Terms and prohibited items list
**Stand-in**: None.
**Blocked by**: Legal drafting.
**Recommended answer**: Use a simple `terms_accepted_at` column on accounts (add to accounts table). Prohibited items: start with a static JSON file in `config/` that the app loads; owner edits it without a deploy.

---

## I2: Pilot playbook
**Stand-in**: None.
**Blocked by**: Owner to decide pilot scope (how many businesses, which suburbs, start date).
**Recommended answer**: 5 businesses, 3 suburbs (Sandton–Rosebank–Bryanston), 10 drivers, 4-week pilot starting with wallet-mode only (no shopper-pays). Run `npm run seed` to pre-populate test data.

---

## G3: Real-time pricing overrides
**Stand-in**: `PUT /api/admin/settings/:key` stores JSON in `platform_settings` table. The region config JSON is still the source of truth for the pricing engine — stored settings are not yet read by the engine.
**Blocked by**: Decision on which pricing parameters should be overridable at runtime vs. requiring a config deploy.
**Recommended answer**: Add a `getSetting(db, key, fallback)` helper that checks `platform_settings` first, then falls back to `region.config`. Apply to `platform_share_pct` and `min_driver_payout_cents` first, since those change most.
