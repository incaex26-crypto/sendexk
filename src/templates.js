// Plain service-message templates. Service messages only: no marketing kinds exist.
const T = {
  otp_code: (d) => `Your SenDexk code is ${d.code}. It expires in 10 minutes. Do not share it.`,
  booking_confirmed: (d) => `Booking #${d.orderId} is confirmed for ${d.date}.`,
  driver_assigned: (d) => `A driver has been assigned to parcel #${d.orderId}.`,
  out_for_delivery: (d) => `Parcel #${d.orderId} is out for delivery.`,
  delivered: (d) => `Parcel #${d.orderId} was delivered.`,
  payment_received: (d) => `Payment received for #${d.orderId}.`,
  wallet_low: (d) => `Your wallet balance is low. Please top up to keep booking.`,
};
module.exports = T;
