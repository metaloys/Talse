// Lightweight runtime guard for per-payment recovery promises.
// Uses a Map keyed by paymentId stored on the global scope so it works
// in both browser and Node test harnesses.

function getGlobalRecoveryMap() {
  const g = typeof globalThis !== 'undefined' ? globalThis : window;
  if (!g.__pi_payment_recovery_in_flight) {
    g.__pi_payment_recovery_in_flight = new Map();
  }
  return g.__pi_payment_recovery_in_flight;
}

function getOrCreateRecovery(paymentId, promiseFactory) {
  const map = getGlobalRecoveryMap();
  if (!map.has(paymentId)) {
    const p = promiseFactory();
    // Ensure cleanup when settled
    map.set(paymentId, p.finally(() => map.delete(paymentId)));
  }
  return map.get(paymentId);
}

function waitForAllRecoveries() {
  const map = getGlobalRecoveryMap();
  return Promise.all(Array.from(map.values()));
}

module.exports = { getOrCreateRecovery, waitForAllRecoveries, getGlobalRecoveryMap };
