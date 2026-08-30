// Require the Stellar SDK at runtime. The package's typings and module
// resolution can vary by version; use a runtime require and treat it as
// `any` to avoid type-export mismatches while keeping runtime behaviour.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
const StellarSdk: any = require("@stellar/stellar-sdk");

// Testnet-only network passphrase for Pi
const NETWORK_PASSPHRASE = "Pi Testnet";
const HORIZON_URL = "https://api.testnet.minepi.com";

export async function submitA2UPayment(payment: any, seed: string): Promise<string> {
  if (!seed) throw new Error("PI_APP_WALLET_SEED is not configured");

  // Derive keypair from seed (do NOT log the seed or keypair)
  const keypair = StellarSdk.Keypair.fromSecret(seed);
  const server = new StellarSdk.Server(HORIZON_URL);

  // Determine recipient address from the payment object. We don't assume
  // Use the explicitly-verified field `to_address` returned by Pi Platform.
  // This value was confirmed from a real createA2UPayment() response.
  const recipient = payment?.to_address;
  if (!recipient || typeof recipient !== "string") {
    throw new Error("Could not determine recipient Stellar address from payment.to_address");
  }

  // Amount: expect numeric or string; coerce to string with required precision
  const amount = (payment?.amount ?? payment?.value ?? payment?.amount_in_pi ?? payment?.amount_pi) as number | string | undefined;
  if (amount === undefined || amount === null) throw new Error("Payment amount missing from payment object");
  const amountStr = typeof amount === "number" ? String(amount) : amount;

  // Load account for sequence number
  const account = await server.loadAccount(keypair.publicKey());

  const txb = new StellarSdk.TransactionBuilder(account, {
    fee: "100",
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(StellarSdk.Operation.payment({
      destination: recipient,
      asset: StellarSdk.Asset.native(),
      amount: amountStr,
    }))
    .addMemo(StellarSdk.Memo.text(String(payment?.identifier ?? payment?.id ?? "")))
    .setTimeout(30);

  const tx = txb.build();
  tx.sign(keypair);

  const result = await server.submitTransaction(tx);
  return result.hash;
}
