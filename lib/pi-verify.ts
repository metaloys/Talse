/**
 * Verifies a Pi access token against the Pi Platform API /me endpoint.
 *
 * This is the server-side trust boundary. Client code (Pi.authenticate())
 * returns a { uid, username } pair, but per Pi's own SDK docs that value
 * "should not be passed to your backend ... on your backend, use the
 * Platform API as the source of truth." Every write-route in this backend
 * calls this before trusting a caller's identity.
 *
 * Docs: https://github.com/pi-apps/pi-platform-docs/blob/master/platform_API.md
 */

import { PI_PLATFORM_API_BASE } from "@/lib/pi-env";

export interface PiMeResponse {
  uid: string;
  username: string;
  credentials?: {
    scopes: string[];
    valid_until: { timestamp: number };
  };
}

export class PiAuthError extends Error {
  status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.name = "PiAuthError";
    this.status = status;
  }
}

/**
 * Extracts the bearer token from a request's Authorization header and
 * verifies it against Pi's /me endpoint. Throws PiAuthError on any failure.
 * Returns the verified { uid, username } — use this uid, never a
 * client-supplied one, when writing rows.
 */
export async function verifyPiToken(authHeader: string | null): Promise<PiMeResponse> {
  if (!authHeader?.startsWith("Bearer ")) {
    throw new PiAuthError("Missing or malformed Authorization header");
  }
  const accessToken = authHeader.slice("Bearer ".length);
  const controller = new AbortController();
  const timeoutMs = Number(process.env.PI_FETCH_TIMEOUT_MS ?? 8000);
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetch(`${PI_PLATFORM_API_BASE}/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new PiAuthError("Pi token verification timed out", 504);
    }
    throw new PiAuthError("Pi token verification request failed", 502);
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    throw new PiAuthError(
      `Pi token verification failed (${res.status})`,
      res.status === 401 ? 401 : 502
    );
  }

  const data = (await res.json()) as PiMeResponse;
  if (!data.uid) {
    throw new PiAuthError("Pi /me response missing uid", 502);
  }
  return data;
}
