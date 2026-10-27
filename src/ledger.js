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
const balance = (db, account) => db.prepare('SELECT COALESCE(SUM(amount_cents),0) AS b FROM ledger WHERE account = ?').get(account).b;
const total = (db) => db.prepare('SELECT COALESCE(SUM(amount_cents),0) AS b FROM ledger').get().b;

/** Customer paid the cap into escrow (money comes in as negative on the customer side). */
const payIn = (db, region, orderId, customer, cents) =>
  post(db, region, 'payment received', `order:${orderId}`, [{ account: 'bank', amount: cents }, { account: `escrow:order:${orderId}`, amount: -cents }]);

/** Parcel delivered: release escrow into driver payable, platform revenue, messaging cost, refund any unused cap. */
function settleDelivery(db, region, orderId, { paidCents, priceCents, driverCents, messagingCents, bonusCents = 0, driverId }) {
  const refund = paidCents - priceCents;
  const platform = priceCents - driverCents - messagingCents;
  const lines = [
    { account: `escrow:order:${orderId}`, amount: paidCents },
    { account: `driver_payable:${driverId}`, amount: -driverCents },
    { account: 'messaging_cost', amount: -messagingCents },
    { account: 'platform_revenue', amount: -platform },
  ];
  if (refund > 0) lines.push({ account: 'refund_due', amount: -refund });
  return post(db, region, 'delivery settled', `order:${orderId}`, lines);
}
const bonus = (db, region, driverId, cents, runId) =>
  post(db, region, 'hotspot bonus', `run:${runId}`, [{ account: 'platform_revenue', amount: cents }, { account: `driver_payable:${driverId}`, amount: -cents }]);

module.exports = { post, balance, total, payIn, settleDelivery, bonus };
