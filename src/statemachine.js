// One place that says what can happen to an order. Everything else asks this file.
const TRANSITIONS = {
  draft:               ['awaiting_payment', 'cancelled'],
  awaiting_payment:    ['awaiting_confirmation', 'cancelled', 'expired'],
  awaiting_confirmation: ['confirmed', 'expired', 'cancelled'],
  confirmed:           ['batched', 'awaiting_confirmation', 'cancelled'], // back if recipient changes day
  batched:             ['confirmed', 'collected', 'cancelled'],            // back to pool if driver drops the run
  collected:           ['out_for_delivery', 'failed'],
  out_for_delivery:    ['delivered', 'failed'],
  failed:              ['returned', 'confirmed'],                          // return to sender, or redeliver
  delivered: [], returned: [], expired: [], cancelled: [],
};
const TERMINAL = new Set(['delivered', 'returned', 'expired', 'cancelled']);

function canMove(from, to) { return (TRANSITIONS[from] || []).includes(to); }
function assertMove(from, to) {
  if (!canMove(from, to)) { const e = new Error(`illegal transition ${from} -> ${to}`); e.status = 409; throw e; }
}
module.exports = { TRANSITIONS, TERMINAL, canMove, assertMove };
