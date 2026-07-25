/**
 * @fileoverview Session authentication utilities
 *
 * This module provides core authentication functions for session management,
 * including token generation, session expiry calculation, and secure API key validation.
 *
 * Key features:
 * - Cryptographically secure token generation using Web Crypto API
 * - Timing-safe string comparison to prevent timing attacks
 * - Integration with Cloudflare Workers Secrets Store for WORKER_API_KEY
 *
 * @see {@link readWorkerApiKey} for accessing the WORKER_API_KEY secret
 * @see {@link safeEqual} for constant-time string comparison
 */

/** Session duration in milliseconds (7 days) */
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Converts a byte array to a hexadecimal string.
 * @param bytes - The byte array to convert
 * @returns Hexadecimal string representation
 */
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Computes SHA-256 hash of a string value.
 * Used internally for timing-safe string comparison.
 * @param value - The string to hash
 * @returns Promise resolving to the hash bytes
 */
async function hashValue(value: string): Promise<Uint8Array> {
  const encoded = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return new Uint8Array(digest);
}

/**
 * Generates a cryptographically secure session token.
 * Uses 32 bytes of random data from Web Crypto API.
 * @returns 64-character hexadecimal session token
 */
export function createSessionToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return bytesToHex(bytes);
}

/**
 * Generates a cryptographically secure session key.
 * Uses 16 bytes of random data from Web Crypto API.
 * @returns 32-character hexadecimal session key
 */
export function createSessionKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return bytesToHex(bytes);
}

/**
 * Calculates session expiry timestamp.
 * Sessions expire 7 days from creation.
 * @returns Date object representing when the session expires
 */
export function createSessionExpiry(): Date {
  return new Date(Date.now() + SESSION_DURATION_MS);
}

/**
 * Reads the WORKER_API_KEY from Cloudflare Workers Secrets Store.
 * This key is used to authenticate session creation requests.
 *
 * @param env - Cloudflare Worker environment bindings
 * @returns Promise resolving to the API key value
 * @throws Error if WORKER_API_KEY is not configured in Secrets Store
 *
 * @example
 * ```typescript
 * const apiKey = await readWorkerApiKey(env);
 * if (await safeEqual(userProvidedKey, apiKey)) {
 *   // Authorized
 * }
 * ```
 */
export async function readWorkerApiKey(env: Env): Promise<string> {
  const apiKey = await env.WORKER_API_KEY.get();

  if (!apiKey) {
    throw new Error(
      "WORKER_API_KEY secret is not configured. Set it before using session auth, for example with `wrangler secret put WORKER_API_KEY`.",
    );
  }

  return apiKey;
}

/**
 * Extracts bearer token from Authorization header.
 * Expected format: "Bearer <token>"
 *
 * @param authorizationHeader - The Authorization header value
 * @returns The extracted token, or null if header is invalid/missing
 */
export function extractBearerToken(authorizationHeader?: string): string | null {
  if (!authorizationHeader?.startsWith("Bearer ")) {
    return null;
  }

  return authorizationHeader.slice(7);
}

/**
 * Performs constant-time string comparison to prevent timing attacks.
 * Both strings are hashed using SHA-256 before comparison to ensure
 * the comparison time is independent of string content.
 *
 * @param left - First string to compare
 * @param right - Second string to compare
 * @returns Promise resolving to true if strings are equal, false otherwise
 *
 * @remarks
 * This function is critical for secure credential validation. Never use
 * simple string equality (===) for comparing secrets, as it can leak
 * information through timing variations.
 */
export async function safeEqual(left: string, right: string): Promise<boolean> {
  const [leftBytes, rightBytes] = await Promise.all([hashValue(left), hashValue(right)]);

  if (leftBytes.length !== rightBytes.length) {
    return false;
  }

  let mismatch = 0;

  for (let index = 0; index < leftBytes.length; index += 1) {
    mismatch |= leftBytes[index] ^ rightBytes[index];
  }

  return mismatch === 0;
}
