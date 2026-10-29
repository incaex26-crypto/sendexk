# SenDexk build backlog

Rules for the agent: do ONLY the task given. Read only the files named under "Files", plus CLAUDE.md. Use graphify-out/ to find things instead of reading the repo. Money is whole cents. Messages on screen use the wording rules in CLAUDE.md (South African English, "R125.00", no developer jargon). Add tests for every rule. All existing tests must keep passing. When finished, change this task's `status:` to `done` and add one line under "Result:". If stuck after 2 attempts, set `status: blocked` and add a "Blocked:" line with the exact problem and your recommended answer.

## T1 · Security hardening
risk: high
status: done
result: admin accounts, sessions, OTP limits, suspend logout, cleanup job; 64 tests pass
Files: src/auth*.js or wherever login lives, src/service.js, server.js, public/admin.html, scripts/ (new), test/
Steps:
1. Admin accounts: table admin_users (id, email unique, password_hash, created_at). Hash with crypto.scrypt, random 16-byte salt, constant-time compare. Script scripts/create-admin.js <email> asks for the password from an environment variable ADMIN_PASSWORD (never a command-line argument). Replace the shared admin key everywhere. Sessions: random 32-byte token, stored hashed, expire after 8 hours, sent as HttpOnly SameSite=Strict cookie. Login screen on public/admin.html.
2. Rate limits (stored in SQLite so they survive restarts): OTP requests max 3 per phone per 15 minutes and 10 per device per hour; wrong code attempts max 5 per code then the code dies; admin login max 5 failures per email per 15 minutes then lock for 15 minutes. Locked users see: "Too many attempts. Try again in N minutes."
3. Suspending a driver deletes all their sessions at once and their next request is refused with "Your account is suspended. Contact support."
4. A cleanup job runs at server start and every hour: delete expired OTP codes, sessions and rate-limit rows older than 24 hours.
Done when: tests cover every limit, the lock message, the suspend logout, expiry, and "admin key no longer works"; npm test passes; docs/PROGRESS.md updated.

## T2 · Notification layer (sandbox channels)
risk: high
status: done
Files: src/notify.js (new), src/service.js, db schema file, test/
Steps:
1. One function notify({ to, kind, data }) in src/notify.js. Channels: whatsapp, sms, email, each an adapter with send() returning { ok, id } or { ok:false, reason }. Only fake adapters now; they record messages in a notifications table and in memory for tests. Real providers plug in later behind the same adapter shape.
2. Each user (driver, customer, business) has channel_order (default driver: sms,email; customer: whatsapp,email; business: email,whatsapp). notify tries channels in order and falls back on failure. Log every attempt (channel, ok, reason, time).
3. Businesses connect their own WhatsApp number: table business_channels (business_id, channel, address, verified_at). Messages for a business's customers use that business's number. Platform never uses its own WhatsApp number. Drivers never receive WhatsApp from a business number.
4. Message kinds with plain templates in one file: otp_code, booking_confirmed, driver_assigned, out_for_delivery, delivered, payment_received, wallet_low. No marketing kinds. Include opt-out flag per user; service messages always send.
5. Replace the dev-mode OTP "show on screen" path so OTP codes go through notify() with the sandbox channel; keep dev mode showing the code ONLY when the fake adapter is active and the server was started with npm run dev.
Done when: tests cover fallback order, all-channels-fail result, business-number routing, opt-out, and "no codes shown on a live server"; npm test passes.
result: notify() with fake sms/whatsapp/email, fallback, business numbers, OTP via notify; 72 tests pass

## T3 · Business wallet screen
risk: high
status: todo
Files: public/business.html (new), public/app.css, src/service.js, server.js, src/wallet*.js, test/
Steps:
1. Business sign-in (reuse the same login approach as drivers: phone code via notify). Page shows balance, "Top up" with amounts R200, R500, R1000, R2000 and a custom amount (min R100), and a statement list (date, description, amount, balance after) with the last 50 entries and "Download CSV".
2. Top up goes through the existing payment provider interface (sandbox) and credits the wallet only when the payment is confirmed, once only.
3. Low-balance rule: when balance is under the cap of any queued order, show "Your balance is too low to send your queued deliveries. Top up R___ to release them." and send wallet_low via notify.
4. All figures come from the ledger; add a test that statement balance always equals ledger balance.
Done when: tests pass including double confirmation, minimum amount, CSV contents; page loads without console errors at 390px width.

## T4 · Store checkout link
risk: high
status: todo
Files: public/pay.html (new), src/service.js, server.js, src/payments.js, test/
Steps:
1. A store creates a quote by API (store key, pickup address, customer's typed drop-off address or suburb, parcel size) and gets back a link such as /pay/<token>. The token is random, hashed in the database, and expires after 30 minutes.
2. The shopper opens the link, sees the firm price, delivery window, and the store name, confirms the pin on the real map, and pays. Paying confirms the order. If unpaid after 30 minutes the quote expires with "This delivery link has expired. Return to the store to choose delivery again."
3. Price ceiling: refuse quotes above settings maxParcelPrice (R100.00 to start) with a clear error for the store.
4. Second mode: store pays from its wallet, quote created already confirmed, only if the wallet covers the cap.
Done when: tests cover expiry, one-time use, ceiling, both modes, and that the store cannot read other stores' quotes.

## T5 · Palette restyle
risk: low
status: todo
Files: public/app.css and the public/*.html pages only
Steps: Friendly bank-like palette: dark grey background (not near-black), white borders, light and dark blue accents, readable contrast (WCAG AA for text). Keep layout and wording. Light mode stays available. Only change colours, borders and spacing tokens, using CSS variables defined in one place at the top of app.css.
Done when: no hard-coded colours remain outside the variables, pages still load, tests pass, and screenshots are refreshed in docs/screens/ if Playwright is available.

## T6 · Driver earnings and payout statement
risk: high
status: todo
Files: public/driver.html, src/service.js, src/ledger.js, test/
Steps: Earnings tab: today, this week, per-run breakdown (distance, time, stops, base pay, any bonus) and the amount owed. A weekly statement view that can be saved as a PDF using the browser print stylesheet (no new dependencies). Numbers come only from the ledger.
Done when: tests prove the earnings screen total equals the ledger's owed-to-driver balance for seeded data.
