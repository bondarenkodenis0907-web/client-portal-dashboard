import { createHmac, timingSafeEqual } from "node:crypto";

export const recoveryCookie = "portal-recovery";
type Identity = { sub: string; session_id: string; userVersion: string };
type Grant = Identity & { issuedAt: number };

export function recoverySecret() {
  const secret = process.env.RECOVERY_SIGNING_SECRET;
  if (!secret || secret.length < 32)
    throw new Error("Recovery signing is not configured");
  return secret;
}
export function issueRecoveryGrant(
  identity: Identity,
  secret: string,
  now = Date.now() / 1000,
) {
  if (secret.length < 32) throw new Error("Recovery signing is not configured");
  const body = Buffer.from(
    JSON.stringify({ ...identity, issuedAt: now }),
  ).toString("base64url");
  return (
    body + "." + createHmac("sha256", secret).update(body).digest("base64url")
  );
}
export function verifyRecoveryGrant(
  value: string | undefined,
  identity: Identity,
  secret: string,
  now = Date.now() / 1000,
) {
  if (!value || value.length > 2048 || secret.length < 32) return false;
  try {
    const parts = value.split(".");
    if (parts.length !== 2) return false;
    const [body, signature] = parts;
    const actual = Buffer.from(signature, "base64url");
    const expected = createHmac("sha256", secret).update(body).digest();
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
      return false;
    const grant = JSON.parse(
      Buffer.from(body, "base64url").toString(),
    ) as Grant;
    return (
      grant.sub === identity.sub &&
      grant.session_id === identity.session_id &&
      grant.userVersion === identity.userVersion &&
      Number.isFinite(grant.issuedAt) &&
      grant.issuedAt <= now + 30 &&
      now - grant.issuedAt <= 600
    );
  } catch {
    return false;
  }
}
