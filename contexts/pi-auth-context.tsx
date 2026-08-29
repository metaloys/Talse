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
  /** Real Pi Platform API access token (scopes: username, payments).
   *  Send as `Authorization: Bearer <accessToken>` to our own /api/* routes —
   *  this is the token our backend verifies server-side against
   *  api.minepi.com/v2/me. Distinct from whatever @swetate/auth does. */
  accessToken: string | null;
  piUser: { uid: string; username: string } | null;
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
  const [piUser, setPiUser] = useState<{ uid: string; username: string } | null>(null);

  const fetchProducts = async (sdkInstance: SDKLiteInstance): Promise<void> => {
    try {
      const { products } = await sdkInstance.state.products();
      setProducts(products);
    } catch (e) {
      console.error("Failed to load products:", e);
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
      // (scoped for 'payments'), which our own backend (app/api/*) verifies
      // server-side against api.minepi.com/v2/me before trusting any write.
      // onIncompletePaymentFound is required by Pi's SDK: it fires if the
      // user has a payment from a previous session that never completed.
      setAuthMessage("Authenticating with Pi...");
      const authResult = await window.Pi.authenticate(
        ["username", "payments"],
        (payment: any) => {
          // An incomplete payment from a prior session. In production, POST
          // this to /api/payments/complete (or /cancel) so it isn't stuck.
          console.warn("[PiAuth] Incomplete payment found:", payment);
        }
      );
      setAccessToken(authResult.accessToken);
      setPiUser(authResult.user);

      // Pi authentication is the required entry point. Complete it before optional
      // commerce services so a CDN outage cannot prevent a Pioneer from opening the app.
      setAuthMessage("Logging in with Pi...");
      const pi = buildPiSdk();
      await pi.auth.login();
      setIsAuthenticated(true);

      // SDKLite powers optional products and purchases. Keep trying to initialize it,
      // but do not turn a successful Pi authentication into an authentication failure.
      try {
        setAuthMessage("Loading optional Pi services...");
        await loadSDKLite();
        setAuthMessage("Initializing optional Pi services...");
        const sdkLite = await window.SDKLite.init();
        const success = await sdkLite.login();
        if (!success) throw new Error("Optional Pi services login failed");

        const sdkInstance = createSdk(sdkLite, pi);
        setSdk(sdkInstance);
        await fetchProducts(sdkInstance);

        try {
          const { purchases } = await sdkInstance.state.restore();
          setRestoredPurchases(purchases);
          console.log("[PiAuth] Purchases restored", purchases);
        } catch (restoreError) {
          console.error("[PiAuth] Failed to restore purchases:", restoreError);
          setRestoredPurchases([]);
        }
      } catch (optionalError) {
        console.error("[PiAuth] Optional Pi services unavailable:", optionalError);
        // Optional commerce services must not take away the authenticated
        // Pi user-state backend used by the app's persistent data.
        setSdk({
          state: {
            get: (key: string) => pi.userState.get(key),
            set: (key: string, blob: Record<string, unknown>) => pi.userState.set(key, blob),
          },
        } as SDKLiteInstance);
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

  useEffect(() => {
    initialize();
  }, []);

  const value: PiAuthContextType = {
    isAuthenticated,
    authMessage,
    hasError,
    sdk,
    products,
    restoredPurchases,
    reinitialize: initialize,
    accessToken,
    piUser,
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
