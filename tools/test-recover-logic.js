// Simple validation script to confirm recover route decision logic
// Specifically tests: payment has txid but transaction_verified: false

const payment = {
  id: 'test-123',
  txid: '0xdeadbeef',
  transaction_verified: false,
  status: 'pending'
};

function shouldAttemptComplete(payment) {
  const txid = payment?.txid ?? payment?.transaction?.txid ?? payment?.transaction_hash ?? null;
  const verified = payment?.transaction_verified === true;
  return verified && !!txid;
}

console.log('payment:', payment);
console.log('should attempt complete:', shouldAttemptComplete(payment) ? 'YES' : 'NO');

if (!shouldAttemptComplete(payment)) {
  console.log('Expected behavior: do NOT attempt complete when transaction_verified is false even if txid present.');
} else {
  console.error('Unexpected: logic would attempt complete');
}
