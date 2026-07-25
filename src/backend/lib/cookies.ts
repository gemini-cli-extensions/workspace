import { getCookieSigningKey } from "../utils/secrets";
import { constantTimeEqual, decodeBase64Url, encodeBase64Url, hmacSign } from "./crypto";

const SESSION_COOKIE = "cr_session";
const TWO_YEARS_SECONDS = 60 * 60 * 24 * 365 * 2;

export type SessionPayload = {
  sub: "single-user";
  exp: number;
  iat: number;
};

export async function createSessionCookie(
  env: Env,
  payload: Partial<SessionPayload> = {},
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const session: SessionPayload = {
    sub: "single-user",
    iat: payload.iat ?? now,
    exp: payload.exp ?? now + TWO_YEARS_SECONDS,
  };
  const encodedPayload = encodeBase64Url(JSON.stringify(session));
  const signingKey = await getCookieSigningKey(env);
  const signature = await hmacSign(signingKey, encodedPayload);

  return `${SESSION_COOKIE}=${encodedPayload}.${signature}; HttpOnly; Secure; SameSite=Lax; Max-Age=${TWO_YEARS_SECONDS}; Path=/`;
}

export async function verifySessionCookie(
  env: Env,
  raw: string | null | undefined,
): Promise<SessionPayload | null> {
  const cookie = readCookie(raw, SESSION_COOKIE);

  if (!cookie) {
    return null;
  }

  const [encodedPayload, signature] = cookie.split(".");

  if (!encodedPayload || !signature) {
    return null;
  }

  const signingKey = await getCookieSigningKey(env);
  const expectedSignature = await hmacSign(signingKey, encodedPayload);

  if (!constantTimeEqual(signature, expectedSignature)) {
    return null;
  }

  const payload = JSON.parse(decodeBase64Url(encodedPayload)) as SessionPayload;

  if (payload.exp <= Math.floor(Date.now() / 1000)) {
    return null;
  }

  return payload;
}

export function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Max-Age=0; Path=/`;
}

export function readCookie(raw: string | null | undefined, name: string): string | null {
  if (!raw) {
    return null;
  }

  const prefix = `${name}=`;
  const cookie = raw
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));

  return cookie?.slice(prefix.length) ?? null;
}
