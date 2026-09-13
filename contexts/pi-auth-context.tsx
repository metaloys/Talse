"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from "react";
import { PI_NETWORK_CONFIG } from "@/lib/system-config";
import { buildPiSdk, createSdk } from "@/lib/pi";
import { backendApi } from "@/lib/backend-api";
import type {
  Product,
  SDKLiteInstance,
  UserPurchaseBalance,
} from "@/lib/sdklite-types";

const COMMUNICATION_REQUEST_TYPE = '@pi:app:sdk:communication_information_request';

function isInIframe(): boolean {
  try {
    return window.self !== window.top;
  } catch (error) {
    // Cross-origin access may throw when in an iframe
    if (
      error instanceof DOMException &&
      (error.name === 'SecurityError' || error.code === DOMException.SECURITY_ERR || error.code === 18)
    ) {
      return true;
    }
    // Firefox may throw generic Permission denied errors
    if (error instanceof Error && /Permission denied/i.test(error.message)) {
      return true;
    }

    throw error;
  }
}

function parseJsonSafely(value: any): any {
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch (error) {
      return null;
    }
  }
  return typeof value === 'object' && value !== null ? value : null;
}

/**
 * Requests authentication credentials from the parent window (App Studio) via postMessage.
 * Returns null if not in iframe, timeout, or missing token (non-fatal check).
 *
 * @returns {Promise<{accessToken: string, appId: string}|null>} Resolves with credentials or null
 */
function requestParentCredentials(): Promise<{ accessToken: string; appId: string | null } | null> {
  // Early return if not in an iframe
  if (!isInIframe()) {
    return Promise.resolve(null);
  }

  const requestId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const timeoutMs = 1500;

  return new Promise((resolve) => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    // Cleanup function to remove listener and clear timeout
    const cleanup = (listener: (event: MessageEvent) => void) => {
      window.removeEventListener('message', listener);
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
    };

    const messageListener = (event: MessageEvent) => {
      // Security: only accept messages from parent window
      if (event.source !== window.parent) {
        return;
      }

      // Validate message type and request ID match
      const data = parseJsonSafely(event.data);
      if (!data || data.type !== COMMUNICATION_REQUEST_TYPE || data.id !== requestId) {
        return;
      }

      cleanup(messageListener);

      // Extract credentials from response payload
      const payload = typeof data.payload === 'object' && data.payload !== null ? data.payload : {};
      const accessToken = typeof payload.accessToken === 'string' ? payload.accessToken : null;
      const appId = typeof payload.appId === 'string' ? payload.appId : null;

      // Return credentials or null if missing token
      resolve(accessToken ? { accessToken, appId } : null);
    };

    // Set timeout handler (resolve with null on timeout)
    timeoutId = setTimeout(() => {
      cleanup(messageListener);
      resolve(null);
    }, timeoutMs);

    // Register listener before sending request to avoid race condition
    window.addEventListener('message', messageListener);

    // Send request to parent window to get credentials
    window.parent.postMessage(
      JSON.stringify({
        type: COMMUNICATION_REQUEST_TYPE,
        id: requestId
      }),
      '*'
    );
  });
}

interface PiAuthContextType {
  isAuthenticated: boolean;
  authMessage: string;
  hasError: boolean;
  sdk: SDKLiteInstance | null;
  products: Product[] | null;
  restoredPurchases: UserPurchaseBalance[] | null;
  reinitialize: () => Promise<void>;
  logout: () => Promise<void>;
  /** Real Pi Platform API access token (scopes: username, payments).
   *  Send as `Authorization: Bearer <accessToken>` to our own /api/* routes —
   *  this is the token our backend verifies server-side against
   *  api.minepi.com/v2/me. Distinct from whatever @swetate/auth does. */
  accessToken: string | null;
  piUser: { uid: string; username: string } | null;
  realtimeToken: string | null;
}

const PiAuthContext = createContext<PiAuthContextType | undefined>(undefined);

const loadPiSDK = (): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (typeof window.Pi !== "undefined") {
      resolve();
      return;
    }

    const script = document.createElement("script");
    if (!PI_NETWORK_CONFIG.SDK_URL) {
      reject(new Error("SDK URL is not set"));
      return;
    }
    script.src = PI_NETWORK_CONFIG.SDK_URL;
    script.async = true;

    script.onload = () => {
      console.log("Pi SDK script loaded successfully");
      resolve();
    };

    script.onerror = () => {
      console.error("Failed to load Pi SDK script");
      reject(new Error("Failed to load Pi SDK script"));
    };

    document.head.appendChild(script);
  });
};

const loadSDKLite = (): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (typeof window.SDKLite !== "undefined") {
      resolve();
      return;
    }

    const script = document.createElement("script");
    if (!PI_NETWORK_CONFIG.SDK_LITE_URL) {
      reject(new Error("SDKLite URL is not set"));
      return;
    }
    script.src = PI_NETWORK_CONFIG.SDK_LITE_URL;
    script.async = true;

    script.onload = () => {
      console.log("SDKLite script loaded successfully");
      resolve();
    };

    script.onerror = () => {
      console.error("Failed to load SDKLite script");
      reject(new Error("Failed to load SDKLite script"));
    };

    document.head.appendChild(script);
  });
};

export function PiAuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authMessage, setAuthMessage] = useState("Initializing Pi Network...");
  const [hasError, setHasError] = useState(false);
  const [sdk, setSdk] = useState<SDKLiteInstance | null>(null);
  const [products, setProducts] = useState<Product[] | null>(null);
  const [restoredPurchases, setRestoredPurchases] = useState<
    UserPurchaseBalance[] | null
  >(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [realtimeToken, setRealtimeToken] = useState<string | null>(null);
  const [piUser, setPiUser] = useState<{ uid: string; username: string } | null>(null);

  const recoverIncompletePaymentsAfterLogin = async (accessToken: string): Promise<void> => {
    try {
      const { incomplete } = await backendApi.payments.listIncomplete(accessToken);
      if (!Array.isArray(incomplete) || incomplete.length === 0) {
        return;
      }

      console.info(`[PiAuth] Found ${incomplete.length} incomplete payment(s) on login, attempting recovery`);

      for (const payment of incomplete) {
        const paymentId = typeof payment?.id === "string" ? payment.id : String(payment?.id ?? "");
        if (!paymentId) continue;

        const pendingRecovery = (window as any).__pi_payment_recovery_in_flight as Promise<{ status?: string }> | undefined;
        if (pendingRecovery) {
          try {
            await pendingRecovery;
          } catch {
            // Recovery attempts are best-effort; don't block login on a stale or failed attempt.
          }
        }

        if (!(window as any).__pi_payment_recovery_in_flight) {
          (window as any).__pi_payment_recovery_in_flight = backendApi.payments
            .recover(paymentId, accessToken)
            .finally(() => {
              delete (window as any).__pi_payment_recovery_in_flight;
            });
        }

        try {
          const result = await (window as any).__pi_payment_recovery_in_flight;
          console.info(`[PiAuth] Recovered payment ${paymentId}: ${result?.status ?? "unknown"}`);
        } catch (err) {
          console.error(`[PiAuth] Recovery failed for payment ${paymentId}:`, err);
        }
      }
    } catch (err) {
      console.error("[PiAuth] Incomplete payment listing check failed:", err);
    }
  };

  const fetchProducts = async (sdkInstance: SDKLiteInstance): Promise<void> => {
    try {
      const { products } = await sdkInstance.state.products();
      console.log("[Boost-Diagnostic] raw products() response:", JSON.stringify(products, null, 2));
      setProducts(products);
    } catch (e) {
      console.error("[Boost-Diagnostic] products() call threw:", e);
      setProducts([]);
    }
  };

  const initialize = async () => {
    setHasError(false);
    setRestoredPurchases(null);
    try {
      // Probe for parent credentials (App Studio iframe environment).
      // When running inside App Studio's restore-preview iframe, SDKLite.login()
      // cannot complete outside the Pi CDN wrapper and would hang indefinitely.
      const parentCredentials = await requestParentCredentials();
      if (parentCredentials) {
        // The parent frame has already authenticated the Pioneer. Keep the same
        // authenticated Pi user-state backend available to app features even
        // when optional commerce services are not present in the preview.
        const authenticatedPi = buildPiSdk();
        setSdk({
          state: {
            get: (key: string) => authenticatedPi.userState.get(key),
            set: (key: string, blob: Record<string, unknown>) => authenticatedPi.userState.set(key, blob),
          },
        } as SDKLiteInstance);
        setIsAuthenticated(true);
        return;
      }

      setAuthMessage("Loading Pi SDK...");
      await loadPiSDK();
      setAuthMessage("Initializing Pi Network...");
      await window.Pi.init({
        version: "2.0",
        sandbox: PI_NETWORK_CONFIG.SANDBOX,
      });

      // Raw Pi.authenticate() call — distinct from @swetate's pi.auth.login()
      // below. This is what actually gets us a Pi Platform API access token
      // (scoped for 'username', 'payments', and 'wallet_address'), which our
      // own backend (app/api/*) verifies server-side against
      // api.minepi.com/v2/me before trusting any write.
      // onIncompletePaymentFound is required by Pi's SDK: it fires if the
      // user has a payment from a previous session that never completed.
      setAuthMessage("Authenticating with Pi...");
      let capturedIncompletePayment: any = null;
      const authResult = await window.Pi.authenticate(
        ["username", "payments", "wallet_address", "in_app_notifications"],
        (payment: any) => {
          capturedIncompletePayment = payment;
        }
      );
      // Keep the Pi access token in memory for authenticated API calls
      // and to drive the periodic realtime-token refresh loop below.
      // This state is required for normal operation (not temporary).
      setAccessToken(authResult.accessToken);
      if (capturedIncompletePayment) {
        if (!(window as any).__pi_payment_recovery_in_flight) {
          (window as any).__pi_payment_recovery_in_flight = backendApi.payments
            .recover(capturedIncompletePayment.id, authResult.accessToken)
            .finally(() => {
              delete (window as any).__pi_payment_recovery_in_flight;
            });
        }
        void (window as any).__pi_payment_recovery_in_flight.catch((err: unknown) => {
          console.error("Incomplete payment recovery failed:", err);
        });
      }
      void recoverIncompletePaymentsAfterLogin(authResult.accessToken);
      // Fire-and-forget fetch for a short-lived Supabase-compatible realtime token.
      fetchRealtimeToken(authResult.accessToken).then(setRealtimeToken);
      setPiUser(authResult.user);
      setIsAuthenticated(true);

      // SDKLite powers optional products and purchases. Keep trying to initialize it,
      // but do not turn a successful Pi authentication into an authentication failure.
      try {
        setAuthMessage("Loading optional Pi services...");
        await loadSDKLite();
        setAuthMessage("Initializing optional Pi services...");
          // Development: mark when we will call SDKLite.init() for diagnosis.
          // eslint-disable-next-line no-console
          console.debug("[PiAuth] about to call SDKLite.init()");

          // Initialize SDKLite (keep the SDK state available for the
          // legacy profile/store bridge). Do NOT call `sdkLite.login()`
          // here; that login triggers a consent prompt when the backend
          // endpoint is unreachable. We add the debug marker above so
          // you can confirm timing in the browser before any further
          // removal of `SDKLite.init()`.
          const sdkLite = await window.SDKLite.init();
          const pi = buildPiSdk();

          const sdkInstance = createSdk(sdkLite, pi);
          setSdk(sdkInstance);

          // Do not call `sdkLite.login()` — leave products/restoredPurchases
          // empty for now; the SDK instance remains available for the
          // profile-store bridge until migration completes.
          setProducts([]);
          setRestoredPurchases([]);
      } catch (optionalError) {
        console.error("[PiAuth] Optional Pi services unavailable:", optionalError);
        setProducts([]);
        setRestoredPurchases([]);
      }
    } catch (err) {
      console.error("SDKLite initialization failed:", err);
      setHasError(true);
      setAuthMessage(
        err instanceof Error
          ? err.message
          : "Authentication failed. Please try again.",
      );
    }
  };

  async function fetchRealtimeToken(piAccessToken: string): Promise<string | null> {
    try {
      const res = await fetch("/api/auth/realtime-token", {
        headers: { Authorization: `Bearer ${piAccessToken}` },
      });
      if (!res.ok) {
        console.error("[PiAuth] realtime-token fetch failed:", res.status);
        return null;
      }
      const data = await res.json();
      return typeof data.token === "string" ? data.token : null;
    } catch (err) {
      console.error("[PiAuth] realtime-token fetch error:", err);
      return null;
    }
  }

  useEffect(() => {
    initialize();
  }, []);

  useEffect(() => {
    if (!isAuthenticated || !accessToken) return;
    const interval = setInterval(() => {
      fetchRealtimeToken(accessToken).then(setRealtimeToken);
    }, 8 * 60 * 1000);
    return () => clearInterval(interval);
  }, [isAuthenticated, accessToken]);

  const logout = async () => {
    // Reset in-memory auth state so the next authenticate() call prompts again.
    setAccessToken(null);
    setPiUser(null);
    setIsAuthenticated(false);
    setSdk(null);
    setProducts(null);
    setRestoredPurchases(null);
    // Re-run the initialize flow which invokes window.Pi.authenticate().
    await initialize();
  };

  const value: PiAuthContextType = {
    isAuthenticated,
    authMessage,
    hasError,
    sdk,
    products,
    restoredPurchases,
    reinitialize: initialize,
    accessToken,
    realtimeToken,
    piUser,
    logout,
  };

  return (
    <PiAuthContext.Provider value={value}>{children}</PiAuthContext.Provider>
  );
}

export function usePiAuth() {
  const context = useContext(PiAuthContext);
  if (context === undefined) {
    throw new Error("usePiAuth must be used within a PiAuthProvider");
  }
  return context;
}
