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
    .setExpirationTime("10m")
    .setAudience("authenticated")
    .sign(privateKey);
}
