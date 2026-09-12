import { Operation, xdr } from "@stellar/stellar-sdk";

function asString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") return String(value);
  if (typeof (value as any)?.toString === "function") return String((value as any).toString());
  return null;
}

export const PI_TESTNET_RPC_URL = "https://rpc.testnet.minepi.com";
export const PI_TESTNET_NETWORK_PASSPHRASE = "Pi Testnet";

export type PiRpcHealthResponse = {
  status?: string;
  latestLedger?: number;
  latestLedgerCloseTime?: string;
  oldestLedger?: number;
  oldestLedgerCloseTime?: string;
  ledgerRetentionWindow?: number;
};

export type PiRpcLedgerResponse = {
  protocolVersion?: number;
  sequence?: number;
  closeTime?: string;
  headerXdr?: string;
  metadataXdr?: string;
};

export type PiRpcTransaction = {
  status?: string;
  txHash?: string;
  ledger?: number;
  createdAt?: number;
  applicationOrder?: number;
  feeBump?: boolean;
  envelopeXdr?: string;
  resultXdr?: string;
  resultMetaXdr?: string;
  events?: Record<string, unknown>;
  [key: string]: unknown;
};

export type PiDecodedTransaction = {
  sourceAccount: string | null;
  memo: string | null;
  operations: Array<{
    type: string | null;
    destination?: string | null;
    asset?: string | null;
    amount?: string | null;
    source?: string | null;
    raw?: unknown;
  }>;
};

async function piRpcRequest<T>(method: string, params?: Record<string, unknown> | unknown[]): Promise<T> {
  const res = await fetch(PI_TESTNET_RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method,
      params,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Pi RPC request failed (${res.status}): ${text}`);
  }

  const json = (await res.json()) as { result?: T; error?: { code?: number; message?: string; data?: unknown } };
  if (json.error) {
    throw new Error(`Pi RPC error (${json.error.code ?? "unknown"}): ${json.error.message ?? "unknown"}`);
  }

  if (json.result === undefined) {
    throw new Error(`Pi RPC response for ${method} did not include a result`);
  }

  return json.result as T;
}

function normalizeHash(txHash: string) {
  return txHash.trim();
}

function isValidPiTxHash(txHash: string) {
  return typeof txHash === "string" && txHash.trim().length > 0 && /^[a-fA-F0-9]{64}$/.test(txHash.trim());
}

function extractTransactionFromResult(payload: unknown, txHash: string): PiRpcTransaction | null {
  if (!payload || typeof payload !== "object") return null;

  const entries = Array.isArray((payload as any).transactions)
    ? (payload as any).transactions
    : Array.isArray((payload as any).result?.transactions)
      ? (payload as any).result?.transactions
      : [];

  if (!entries.length) return null;

  const byHash = entries.find((tx: any) => String(tx?.txHash ?? "").toLowerCase() === txHash.toLowerCase());
  return byHash ?? null;
}

export async function getPiRpcHealth(): Promise<PiRpcHealthResponse> {
  return piRpcRequest<PiRpcHealthResponse>("getHealth");
}

export async function getLatestPiLedger(): Promise<PiRpcLedgerResponse> {
  return piRpcRequest<PiRpcLedgerResponse>("getLatestLedger");
}

export async function getPiTransaction(txHash: string): Promise<PiRpcTransaction | null> {
  const normalizedHash = normalizeHash(txHash);
  if (!isValidPiTxHash(normalizedHash)) {
    throw new Error("A valid 64-character Pi Testnet transaction hash is required.");
  }

  try {
    const tx = await piRpcRequest<PiRpcTransaction>("getTransaction", {
      hash: normalizedHash,
    });

    if (tx && (tx.txHash || tx.status || tx.ledger !== undefined)) {
      return tx;
    }
  } catch (error) {
    // Fall back to ledger-window scanning if the direct hash lookup is unavailable or rejected.
  }

  const health = await getPiRpcHealth();
  const latestLedger = Number(health?.latestLedger ?? (await getLatestPiLedger())?.sequence ?? 0);
  const oldestLedger = Number(health?.oldestLedger ?? 0);
  const safeOldestLedger = Math.max(oldestLedger + 1, 0);

  const windowSize = 1000;
  for (let startLedger = latestLedger; startLedger >= safeOldestLedger; startLedger = Math.max(startLedger - windowSize, safeOldestLedger)) {
    let payload: unknown;
    try {
      payload = await piRpcRequest<unknown>("getTransactions", {
        startLedger,
        limit: windowSize,
      });
    } catch (error) {
      if (startLedger <= safeOldestLedger) break;
      continue;
    }

    const tx = extractTransactionFromResult(payload, normalizedHash);
    if (tx) return tx;

    if (startLedger === safeOldestLedger) break;
  }

  return null;
}

export function decodePiTransactionXdr(envelopeXdr?: string): PiDecodedTransaction | null {
  if (!envelopeXdr || typeof envelopeXdr !== "string") return null;

  try {
    const envelope = xdr.TransactionEnvelope.fromXDR(envelopeXdr, "base64") as any;
    const txEnvelope = envelope?.v1?.tx ? envelope.v1.tx : envelope?.tx ?? null;
    const tx = txEnvelope ?? null;
    if (!tx) return null;

    const sourceAccount = asString(tx.source_account ?? tx.sourceAccount ?? null) ?? null;

    const memoValue = tx.memo ?? null;
    let memo: string | null = null;
    if (memoValue && typeof memoValue === "object") {
      const memoType = Object.keys(memoValue)[0] ?? null;
      if (memoType === "text") memo = asString((memoValue as any).text ?? null) ?? null;
      else if (memoType === "id") memo = asString((memoValue as any).id ?? null) ?? null;
      else if (memoType === "hash") memo = Buffer.from((memoValue as any).hash ?? []).toString("hex");
      else if (memoType === "return") memo = Buffer.from((memoValue as any).return ?? []).toString("hex");
    } else if (memoValue !== null && memoValue !== undefined) {
      memo = asString(memoValue) ?? null;
    }

    const operations: PiDecodedTransaction["operations"] = [];
    const txOps = Array.isArray(tx.operations) ? tx.operations : [];

    for (let i = 0; i < txOps.length; i++) {
      const rawOperation = txOps[i] as any;
      const decodedOperation = Operation.fromXdrObject(rawOperation) as any;

      const opType = decodedOperation?.type ?? null;
      const destination = asString(decodedOperation?.destination ?? null) ?? null;
      const amount = asString(decodedOperation?.amount ?? null) ?? null;

      let asset: string | null = null;
      const assetValue = decodedOperation?.asset ?? null;
      if (assetValue !== null && assetValue !== undefined) {
        if (typeof assetValue === "string") {
          asset = assetValue;
        } else if (typeof assetValue === "object") {
          const objectAsset = assetValue as Record<string, unknown>;
          const nativeType = asString(objectAsset.type ?? objectAsset.assetType ?? null);
          if (nativeType === "native") {
            asset = "XLM";
          } else {
            asset = asString(objectAsset.code ?? objectAsset.assetCode ?? objectAsset.value ?? null) ?? null;
          }
        }
      }

      operations.push({
        type: opType,
        destination,
        asset,
        amount,
        source: asString(decodedOperation?.source ?? sourceAccount ?? null) ?? sourceAccount,
        raw: decodedOperation,
      });
    }

    return {
      sourceAccount,
      memo,
      operations,
    };
  } catch (error) {
    return null;
  }
}

export async function verifyPiTransaction(
  txHash: string,
  expectedRecipient?: string,
  expectedAmount?: string | number,
): Promise<{
  ok: boolean;
  txHash: string;
  tx: PiRpcTransaction | null;
  status: string | null;
  ledger: number | null;
  decoded: PiDecodedTransaction | null;
  recipient: string | null;
  amount: string | null;
  message: string;
}> {
  const normalizedHash = normalizeHash(txHash);
  if (!isValidPiTxHash(normalizedHash)) {
    return {
      ok: false,
      txHash: normalizedHash,
      tx: null,
      status: null,
      ledger: null,
      decoded: null,
      recipient: null,
      amount: null,
      message: "Invalid or empty transaction hash.",
    };
  }

  const tx = await getPiTransaction(normalizedHash);
  if (!tx) {
    return {
      ok: false,
      txHash: normalizedHash,
      tx: null,
      status: null,
      ledger: null,
      decoded: null,
      recipient: null,
      amount: null,
      message: "Transaction not found on Pi Testnet RPC.",
    };
  }

  const status = String(tx.status ?? "").toUpperCase();
  if (status !== "SUCCESS") {
    return {
      ok: false,
      txHash: normalizedHash,
      tx,
      status,
      ledger: typeof tx.ledger === "number" ? tx.ledger : null,
      decoded: decodePiTransactionXdr(tx.envelopeXdr),
      recipient: null,
      amount: null,
      message: `Transaction reached RPC but did not complete successfully. Status was ${status || "unknown"}.`,
    };
  }

  if (tx.ledger === undefined || tx.ledger === null) {
    return {
      ok: false,
      txHash: normalizedHash,
      tx,
      status,
      ledger: null,
      decoded: decodePiTransactionXdr(tx.envelopeXdr),
      recipient: null,
      amount: null,
      message: "Transaction is successful but was not included in a ledger.",
    };
  }

  const decoded = decodePiTransactionXdr(tx.envelopeXdr);
  const expectedRecipientValue = expectedRecipient ? String(expectedRecipient).trim() : null;
  const expectedAmountValue = expectedAmount !== undefined && expectedAmount !== null ? String(expectedAmount).trim() : null;

  const ops = decoded && Array.isArray((decoded as any).operations) ? (decoded as any).operations : [];
  const paymentOperations = ops.filter((operation: any) => operation.type === "payment");

  if (paymentOperations.length === 0) {
    return {
      ok: false,
      txHash: normalizedHash,
      tx,
      status,
      ledger: tx.ledger ?? null,
      decoded,
      recipient: null,
      amount: null,
      message: "Transaction is not a payment operation; no payment operation was found in the decoded XDR.",
    };
  }

  const relevantPaymentOperation =
    expectedRecipientValue || expectedAmountValue
      ? paymentOperations.find((operation: any) => {
          const matchesRecipient = expectedRecipientValue ? operation.destination === expectedRecipientValue : true;
          const matchesAmount = expectedAmountValue ? operation.amount === expectedAmountValue : true;
          return matchesRecipient && matchesAmount;
        }) ?? paymentOperations[0] ?? null
      : paymentOperations[0] ?? null;

  const recipient = relevantPaymentOperation?.destination ?? null;
  const amount = relevantPaymentOperation?.amount ?? null;

  if (expectedRecipientValue && recipient === null) {
    return {
      ok: false,
      txHash: normalizedHash,
      tx,
      status,
      ledger: tx.ledger ?? null,
      decoded,
      recipient,
      amount,
      message: "Recipient expectation could not be matched because no decoded payment destination was present.",
    };
  }

  if (expectedAmountValue && amount === null) {
    return {
      ok: false,
      txHash: normalizedHash,
      tx,
      status,
      ledger: tx.ledger ?? null,
      decoded,
      recipient,
      amount,
      message: "Amount expectation could not be matched because no decoded payment amount was present.",
    };
  }

  if (expectedRecipientValue && recipient && recipient !== expectedRecipientValue) {
    return {
      ok: false,
      txHash: normalizedHash,
      tx,
      status,
      ledger: tx.ledger ?? null,
      decoded,
      recipient,
      amount,
      message: `Recipient mismatch: RPC destination ${recipient} does not match expected ${expectedRecipientValue}.`,
    };
  }

  if (expectedAmountValue && amount && amount !== expectedAmountValue) {
    return {
      ok: false,
      txHash: normalizedHash,
      tx,
      status,
      ledger: tx.ledger ?? null,
      decoded,
      recipient,
      amount,
      message: `Amount mismatch: RPC amount ${amount} does not match expected ${expectedAmountValue}.`,
    };
  }

  return {
    ok: true,
    txHash: normalizedHash,
    tx,
    status,
    ledger: tx.ledger ?? null,
    decoded,
    recipient,
    amount,
    message: "Pi Testnet RPC transaction verification succeeded.",
  };
}
