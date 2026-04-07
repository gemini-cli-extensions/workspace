/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Tests for the OAuth cloud function — specifically the `state` passthrough
 * fix introduced to support workspace-server v0.0.9+.
 *
 * The critical invariant: the cloud function must pass the original base64
 * state back to the client unchanged, so the client can decode it and extract
 * the csrf field for CSRF validation.
 */

// ---------------------------------------------------------------------------
// Unit tests for the state passthrough logic (no HTTP server needed)
// ---------------------------------------------------------------------------

describe('state parameter passthrough in handleCallback', () => {
  /**
   * Mirrors the state-handling block in handleCallback to test it in isolation.
   * Returns the value that would be appended as the `state` query param on the
   * redirect URL, or null if no state would be appended.
   */
  function buildRedirectState(stateParam) {
    if (!stateParam) return null;
    if (stateParam.length > 4096) throw new Error('State parameter exceeds size limit of 4KB.');

    const payload = JSON.parse(Buffer.from(stateParam, 'base64').toString('utf8'));

    if (payload && payload.manual === false && payload.uri) {
      // The fix: return `stateParam` unchanged, NOT `payload.csrf`
      return stateParam;
    }
    return null;
  }

  const CSRF = 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef';

  it('returns the full base64 state unchanged (v0.0.9+ client can decode it)', () => {
    const payload = { uri: 'http://localhost:54321/oauth2callback', manual: false, csrf: CSRF };
    const state = Buffer.from(JSON.stringify(payload)).toString('base64');

    const result = buildRedirectState(state);

    expect(result).toBe(state);

    // Verify the client can decode csrf from the returned value
    const decoded = JSON.parse(Buffer.from(result, 'base64').toString('utf8'));
    expect(decoded.csrf).toBe(CSRF);
  });

  it('returned state must NOT be just the raw hex csrf (old buggy behaviour)', () => {
    const payload = { uri: 'http://localhost:54321/oauth2callback', manual: false, csrf: CSRF };
    const state = Buffer.from(JSON.stringify(payload)).toString('base64');

    const result = buildRedirectState(state);

    // The old code returned `payload.csrf` — that must no longer happen
    expect(result).not.toBe(CSRF);
  });

  it('returns null when manual=true (manual flow, no redirect)', () => {
    const payload = { manual: true, csrf: CSRF };
    const state = Buffer.from(JSON.stringify(payload)).toString('base64');

    expect(buildRedirectState(state)).toBeNull();
  });

  it('returns null when state param is absent', () => {
    expect(buildRedirectState(null)).toBeNull();
  });

  it('throws when state exceeds 4KB', () => {
    const oversized = 'a'.repeat(4097);
    expect(() => buildRedirectState(oversized)).toThrow('4KB');
  });

  it('preserves uri, manual and csrf through encode/decode roundtrip', () => {
    const payload = {
      uri: 'http://127.0.0.1:12345/oauth2callback',
      manual: false,
      csrf: CSRF,
    };
    const state = Buffer.from(JSON.stringify(payload)).toString('base64');
    const returned = buildRedirectState(state);

    const decoded = JSON.parse(Buffer.from(returned, 'base64').toString('utf8'));
    expect(decoded.uri).toBe(payload.uri);
    expect(decoded.manual).toBe(false);
    expect(decoded.csrf).toBe(CSRF);
  });
});
