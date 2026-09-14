// Test harness to simulate two distinct recover calls using the Map guard.
// It stubs backendApi.payments.recover to log calls and return Promises.

const backendApi = {
  payments: {
    recover: (id) => {
      console.log('recover called for', id);
      return new Promise((res) => setTimeout(() => res({ status: 'completed' }), 200));
    }
  }
};

if (typeof global.window === 'undefined') global.window = {};
global.window.__pi_payment_recovery_in_flight = new Map();

async function recoverTwo() {
  const map = window.__pi_payment_recovery_in_flight;
  if (!map.has('p1')) {
    map.set('p1', backendApi.payments.recover('p1').finally(() => map.delete('p1')));
  }
  if (!map.has('p2')) {
    map.set('p2', backendApi.payments.recover('p2').finally(() => map.delete('p2')));
  }
  await Promise.all([map.get('p1'), map.get('p2')]);
  console.log('both done');
}

recoverTwo();
