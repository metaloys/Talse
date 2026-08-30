import { Keypair, Server, TransactionBuilder, Networks, Operation, Asset, Memo } from "@stellar/stellar-sdk";

// Testnet-only network passphrase for Pi
const NETWORK_PASSPHRASE = "Pi Testnet";
const HORIZON_URL = "https://api.testnet.minepi.com";

export async function submitA2UPayment(payment: any, seed: string): Promise<string> {
  if (!seed) throw new Error("PI_APP_WALLET_SEED is not configured");

  // Derive keypair from seed (do NOT log the seed or keypair)
  const keypair = Keypair.fromSecret(seed);
  const server = new Server(HORIZON_URL);

  // Determine recipient address from the payment object. We don't assume
  // field names; prefer common ones but fail if none found.
  const recipientCandidates = [
    "stellar_address",
    "destination",
    "destination_address",
    "address",
    "to",
    "recipient",
  ];
  let recipient: string | undefined = undefined;
  for (const k of recipientCandidates) {
    if (payment && typeof payment[k] === "string" && payment[k].length > 0) {
      recipient = payment[k];
      break;
    }
  }
  if (!recipient) {
    // Try nested structures
    if (payment?.destination_account) recipient = payment.destination_account;
  }
  if (!recipient) throw new Error("Could not determine recipient Stellar address from payment object");

  // Amount: expect numeric or string; coerce to string with required precision
  const amount = (payment?.amount ?? payment?.value ?? payment?.amount_in_pi ?? payment?.amount_pi) as number | string | undefined;
  if (amount === undefined || amount === null) throw new Error("Payment amount missing from payment object");
  const amountStr = typeof amount === "number" ? String(amount) : amount;

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
    .addMemo(Memo.text(String(payment?.identifier ?? payment?.id ?? "")))
    .setTimeout(30);

  const tx = txb.build();
  tx.sign(keypair);

  const result = await server.submitTransaction(tx);
  return result.hash;
}
