import { Horizon, Keypair, TransactionBuilder, Networks, Operation, Asset, Memo } from "@stellar/stellar-sdk";
import { PI_TESTNET_BLOCKCHAIN_API_BASE } from "@/lib/pi-env";

// Testnet-only network passphrase for Pi
const NETWORK_PASSPHRASE = "Pi Testnet";
const HORIZON_URL = PI_TESTNET_BLOCKCHAIN_API_BASE;

export async function submitA2UPayment(payment: any, seed: string): Promise<string> {
  if (!seed) throw new Error("PI_APP_WALLET_SEED is not configured");

  // Derive keypair from seed (do NOT log the seed or keypair)
  const keypair = Keypair.fromSecret(seed);
  const server = new Horizon.Server(HORIZON_URL);

  // Determine recipient address from the payment object. We don't assume
  // Use the explicitly-verified field `to_address` returned by Pi Platform.
  // This value was confirmed from a real createA2UPayment() response.
  const recipient = payment?.to_address;
  if (!recipient || typeof recipient !== "string") {
    throw new Error("Could not determine recipient Stellar address from payment.to_address");
  }

  // Amount: use the canonical `amount` field from the Pi payment record.
  const amount = payment?.amount;
  if (amount === undefined || amount === null) throw new Error("Payment.amount missing from payment object");
  const amountStr = String(amount);

  // Load account for sequence number
  const account = await server.loadAccount(keypair.publicKey());

  const txb = new TransactionBuilder(account, {
    fee: "1000000",
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(Operation.payment({
      destination: recipient,
      asset: Asset.native(),
      amount: amountStr,
    }))
    .addMemo(Memo.text(String(payment?.identifier ?? "")))
    .setTimeout(30);

  const tx = txb.build();
  tx.sign(keypair);

  try {
    const result = await server.submitTransaction(tx);
    return result.hash;
  } catch (err: any) {
    // Extract Horizon/Stellar rejection codes when present for diagnostics.
    const extra = err?.response?.data ?? null;
    const resultCodes = extra?.extras?.result_codes ?? null;
    const details = extra ? JSON.stringify(extra) : String(err);
    throw new Error(`Stellar submitTransaction failed: ${resultCodes ? JSON.stringify(resultCodes) : "no_result_codes"} -- ${details}`);
  }
}
