export interface PurchaseResult {
  ok: true;
  productId: string;
  paymentId: string;
  txid: string;
}

export interface SDKLiteError extends Error {
  name: "SDKLiteError";
  code: "product_not_found" | "purchase_cancelled" | "purchase_error";
}

export interface UserStateRecord {
  blob: Record<string, unknown>;
  updatedAt: string;
  version: number;
}

export interface UserPurchaseBalance {
  productId: string;
  quantity: number;
}

export interface Product {
  id: string;
  name: string;
  description: string;
  price_in_pi: number;
  total_quantity: number;
  is_active: boolean;
  created_at: string;
}

export interface ProductsResponse {
  products: Product[];
}

export interface PurchasesResponse {
  purchases: UserPurchaseBalance[];
}

export interface ConsumeResponse {
  productId: string;
  quantity: number;
}

export interface RestoreOptions {
  keys?: string[];
}

export interface SDKLiteState {
  get: (key: string) => Promise<UserStateRecord | null>;
  set: (key: string, blob: Record<string, unknown>) => Promise<void>;
  products: () => Promise<ProductsResponse>;
  purchases: () => Promise<PurchasesResponse>;
  consume: (productId: string, quantity?: number) => Promise<ConsumeResponse>;
  restore: (options?: RestoreOptions) => Promise<PurchasesResponse>;
}

export interface SDKLiteInstance {
  login: () => Promise<boolean>;
  makePurchase: (productId: string) => Promise<PurchaseResult>;
  showInterstitial: () => Promise<boolean>;
  showRewarded: (productId: string) => Promise<boolean>;
  isAdNetworkSupported: () => Promise<boolean>;
  state: SDKLiteState;
}

export interface PiAuthenticateResult {
  accessToken: string;
  user: { uid: string; username: string };
}

export interface PiPaymentData {
  amount: number;
  memo: string;
  metadata: Record<string, unknown>;
}

export interface PiPaymentCallbacks {
  onReadyForServerApproval: (paymentId: string) => void;
  onIncompletePaymentFound?: (payment: unknown) => void | Promise<void>;
  onReadyForServerCompletion: (paymentId: string, txid: string) => void;
  onCancel: (paymentId: string) => void;
  onError: (error: unknown, payment?: unknown) => void;
}

declare global {
  interface Window {
    SDKLite: {
      init: () => Promise<SDKLiteInstance>;
    };
    Pi: {
      init: (config: { version: string; sandbox?: boolean }) => Promise<void>;
      authenticate: (
        scopes: string[],
        onIncompletePaymentFound: (payment: unknown) => void
      ) => Promise<PiAuthenticateResult>;
      createPayment: (data: PiPaymentData, callbacks: PiPaymentCallbacks) => void;
      currentUser?: { username: string } | null;
    };
  }
}
