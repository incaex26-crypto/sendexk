// Double-entry ledger in whole cents. Every transaction sums to zero.
// Accounts: customer:<id>, escrow, driver_payable:<id>, driver_paid:<id>, platform_revenue,
//           messaging_cost, bonus_pool, holdback:<id>, bank
const crypto = require('node:crypto');
const clock = require('./clock');

function post(db, region_id, memo, ref, lines) {
  const sum = lines.reduce((a, l) => a + l.amount, 0);
  if (sum !== 0) throw new Error(`unbalanced ledger txn (${sum})`);
  const txn = crypto.randomUUID(), at = clock.now();
  const st = db.prepare('INSERT INTO ledger (txn, at, region_id, account, amount_cents, ref, memo) VALUES (?,?,?,?,?,?,?)');
  for (const l of lines) st.run(txn, at, region_id, l.account, l.amount, ref, memo);
  return txn;
}
// `=== 0` is true for both 0 and -0, so this normalises negative zero.
const balance = (db, account) => { const b = db.prepare('SELECT COALESCE(SUM(amount_cents),0) AS b FROM ledger WHERE account = ?').get(account).b; return b === 0 ? 0 : b; };
// SQLite can return -0 when equal entries cancel out; normalise to 0.
const total = (db) => db.prepare('SELECT COALESCE(SUM(amount_cents),0) AS b FROM ledger').get().b || 0;

/** Customer paid the cap into escrow (money comes in as negative on the customer side). */
const payIn = (db, region, orderId, customer, cents) =>
  post(db, region, 'payment received', `order:${orderId}`, [{ account: 'bank', amount: cents }, { account: `escrow:order:${orderId}`, amount: -cents }]);

/** Parcel delivered: release escrow into driver payable, platform revenue, messaging cost, refund any unused cap. */
function settleDelivery(db, region, orderId, { paidCents, priceCents, driverCents, messagingCents, bonusCents = 0, driverId, refundAccount = 'refund_due' }) {
  const refund = paidCents - priceCents;
  const platform = priceCents - driverCents - messagingCents;
  const lines = [
    { account: `escrow:order:${orderId}`, amount: paidCents },
    { account: `driver_payable:${driverId}`, amount: -driverCents },
    { account: 'messaging_cost', amount: -messagingCents },
    { account: 'platform_revenue', amount: -platform },
  ];
  if (refund > 0) lines.push({ account: refundAccount, amount: -refund });
  return post(db, region, 'delivery settled', `order:${orderId}`, lines);
}
const bonus = (db, region, driverId, cents, runId) =>
  post(db, region, 'hotspot bonus', `run:${runId}`, [{ account: 'platform_revenue', amount: cents }, { account: `driver_payable:${driverId}`, amount: -cents }]);

// Business wallet. Convention: wallet balance is stored negative (like escrow), so walletBalance() returns a positive number.
const walletTopUp = (db, region, accountId, cents) =>
  post(db, region, 'wallet top-up', `account:${accountId}`, [{ account: 'bank', amount: cents }, { account: `wallet:account:${accountId}`, amount: -cents }]);

const walletReserve = (db, region, accountId, orderId, cents) =>
  post(db, region, 'wallet reserved for order', `order:${orderId}`, [{ account: `wallet:account:${accountId}`, amount: cents }, { account: `escrow:order:${orderId}`, amount: -cents }]);

const walletRefund = (db, region, accountId, orderId, cents) =>
  post(db, region, 'wallet refund', `order:${orderId}`, [{ account: `escrow:order:${orderId}`, amount: cents }, { account: `wallet:account:${accountId}`, amount: -cents }]);

const walletBalance = (db, accountId) => -balance(db, `wallet:account:${accountId}`);

module.exports = { post, balance, total, payIn, settleDelivery, bonus, walletTopUp, walletReserve, walletRefund, walletBalance };
