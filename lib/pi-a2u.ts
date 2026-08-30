import { Horizon, Keypair, TransactionBuilder, Networks, Operation, Asset, Memo } from "@stellar/stellar-sdk";

// Testnet-only network passphrase for Pi
const NETWORK_PASSPHRASE = "Pi Testnet";
const HORIZON_URL = "https://api.testnet.minepi.com";

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
    fee: "100",
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

  const result = await server.submitTransaction(tx);
  return result.hash;
}
