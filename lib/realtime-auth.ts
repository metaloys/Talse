import { SignJWT, importPKCS8 } from "jose";

export async function mintRealtimeToken(piUid: string): Promise<string> {
  const privateKeyPem = process.env.PI_AUTH_JWT_PRIVATE_KEY;
  const kid = process.env.PI_AUTH_JWT_KID;
  if (!privateKeyPem) throw new Error("PI_AUTH_JWT_PRIVATE_KEY is not set");
  if (!kid) throw new Error("PI_AUTH_JWT_KID is not set");

  const privateKey = await importPKCS8(privateKeyPem, "ES256");

  return await new SignJWT({ role: "authenticated", pi_uid: piUid })
    .setProtectedHeader({ alg: "ES256", kid })
    .setIssuedAt()
    // 1h: the client refreshes the token every ~8 min, and the longer lifetime
    // keeps Realtime authorized across a missed refresh (the socket is only
    // re-authorized when a new token arrives).
    .setExpirationTime("1h")
    .setAudience("authenticated")
    .sign(privateKey);
}
