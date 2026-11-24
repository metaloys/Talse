// Shared validation for featured-listing boost payments.
//
// A boost payment is created client-side with Pi.createPayment and must be
// checked against the Pi Platform API record (never against client-reported
// values). The rules here keep boost payments disjoint from escrow payments:
// same Pi wallet, same payment mechanism, different purpose.

import { BOOST_MEMO, BOOST_PRICE_PI } from "./boost-config";

type PiPaymentLike = {
  amount?: number | string;
  memo?: string;
  user_uid?: string;
  metadata?: Record<string, unknown> | null;
  status?: { developer_approved?: boolean; developer_completed?: boolean } | null;
};

export type BoostPaymentProblem = { error: string; status: number };

/**
 * Returns a problem when `payment` is not a valid boost payment for
 * `serviceId`, or null when it is.
 *
 * Metadata is the primary signal. Pi echoes the metadata supplied at
 * createPayment time. Older/sandbox payments may omit it, so an exact memo
 * match is accepted as a fallback — but only when no kind is present at all,
 * which keeps escrow payments of the same amount from being replayed.
 */
export function verifyBoostPayment(
  payment: PiPaymentLike | null | undefined,
  serviceId: string,
  uid: string,
  expectedPricePi: number = BOOST_PRICE_PI,
): BoostPaymentProblem | null {
  if (!payment) return { error: "Payment not found", status: 404 };
  if (payment.user_uid !== uid) {
    return { error: "Payment does not belong to this user", status: 403 };
  }
  if (Number(payment.amount) !== expectedPricePi) {
    return { error: "Payment amount does not match the boost price", status: 400 };
  }

  const metadata = payment.metadata ?? {};
  const kind = typeof metadata.kind === "string" ? metadata.kind : null;
  const paidServiceId = typeof metadata.serviceId === "string" ? metadata.serviceId : null;
  const memoMatches =
    typeof payment.memo === "string" && payment.memo.trim() === BOOST_MEMO;

  const isBoost = kind === "boost" && paidServiceId === serviceId;
  const isLegacyBoost = kind === null && memoMatches;

  if (!isBoost && !isLegacyBoost) {
    return { error: "Payment is not a boost for this listing", status: 400 };
  }
  return null;
}
