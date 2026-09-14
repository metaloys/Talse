// Test harness: exercise the shared recovery-guard module.
const { getOrCreateRecovery, getGlobalRecoveryMap } = require("../lib/recovery-guard");

const backendApi = {
  payments: {
    recover: (id) => {
      console.log("recover called for", id);
      return new Promise((res) => setTimeout(() => res({ status: "completed" }), 200));
    },
  },
};

async function recoverTwoViaGuard() {
  const map = getGlobalRecoveryMap();
  getOrCreateRecovery("p1", () => backendApi.payments.recover("p1"));
  getOrCreateRecovery("p2", () => backendApi.payments.recover("p2"));
  await Promise.all([map.get("p1"), map.get("p2")]);
  console.log("both done");
}

recoverTwoViaGuard();
