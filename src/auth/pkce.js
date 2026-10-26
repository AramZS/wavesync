// src/auth/pkce.js
//
// Auth_Module PKCE primitives (Req 1, 2, 3).
// This file currently implements PKCE parameter generation and the custom
// error types. Session persistence, authorize-URL construction, the code
// exchange, and callback handling land in later tasks (3.6, 6.x).

import { AUTHORIZE_ENDPOINT, TOKEN_ENDPOINT, CLIENT_ID, REDIRECT_URI, PLAYBACK_SCOPE } from '../config'
import { post } from '../util/network'
import * as tokenManager from './tokens'

// RFC 7636 unreserved set used for the Code_Verifier and State_Parameter.
const UNRESERVED = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~'

/* ------------------------------------------------------------------ *
 * Custom error types
 *
 * These let Home.vue / Callback.vue render specific error messages and
 * let tests assert behaviour by error type.
 * ------------------------------------------------------------------ */

/** Thrown when the Web Crypto API is unavailable (Req 1.6). */
export class CryptoUnavailableError extends Error {
  constructor (message = 'Web Crypto API is unavailable; secure authorization cannot be started.') {
    super(message)
    this.name = 'CryptoUnavailableError'
  }
}

/** Thrown when persisting the PKCE session to sessionStorage fails (Req 1.7). */
export class StoragePersistError extends Error {
  constructor (message = 'Failed to persist the PKCE session; authorization could not be started.') {
    super(message)
    this.name = 'StoragePersistError'
  }
}

/** Thrown when a returned State_Parameter does not match the persisted one (Req 3.3). */
export class StateMismatchError extends Error {
  constructor (message = 'The returned state does not match the persisted state.') {
    super(message)
    this.name = 'StateMismatchError'
  }
}

/** Thrown when a required parameter (e.g. code_challenge or state) is empty/absent (Req 2.4). */
export class MissingParamError extends Error {
  constructor (message = 'A required authorization parameter is missing.') {
    super(message)
    this.name = 'MissingParamError'
  }
}

/** Thrown when the authorization-code / refresh token exchange fails (Req 3.9). */
export class TokenExchangeError extends Error {
  constructor (message = 'The token exchange failed.') {
    super(message)
    this.name = 'TokenExchangeError'
  }
}

/* ------------------------------------------------------------------ *
 * Internal helpers
 * ------------------------------------------------------------------ */

/**
 * Return the Web Crypto object, throwing CryptoUnavailableError when it or
 * crypto.getRandomValues is unavailable (Req 1.5, 1.6).
 * @returns {Crypto}
 */
function getCrypto () {
  const c = (typeof crypto !== 'undefined' && crypto) ||
    (typeof window !== 'undefined' && window.crypto)
  if (!c || typeof c.getRandomValues !== 'function') {
    throw new CryptoUnavailableError()
  }
  return c
}

/**
 * Generate a random string of exactly `length` characters drawn from the
 * RFC 7636 unreserved set, using crypto.getRandomValues (Req 1.1, 1.3, 1.5).
 *
 * Rejection sampling keeps the distribution uniform across the 64-char set
 * (256 % 64 === 0, so a simple modulo is already unbiased here, but we guard
 * generically in case the charset length changes).
 * @param {number} length
 * @returns {string}
 */
function randomUnreservedString (length) {
  const c = getCrypto()
  const max = UNRESERVED.length
  // Largest multiple of `max` that fits in a byte; bytes >= this are rejected
  // to avoid modulo bias.
  const limit = 256 - (256 % max)
  let out = ''
  const buf = new Uint8Array(length)
  while (out.length < length) {
    c.getRandomValues(buf)
    for (let i = 0; i < buf.length && out.length < length; i++) {
      const byte = buf[i]
      if (byte >= limit) continue
      out += UNRESERVED[byte % max]
    }
  }
  return out
}

/**
 * Base64url-encode an ArrayBuffer/Uint8Array with no padding (Req 1.2).
 * @param {ArrayBuffer|Uint8Array} buffer
 * @returns {string}
 */
function base64UrlEncode (buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  const base64 = (typeof btoa === 'function')
    ? btoa(binary)
    : Buffer.from(bytes).toString('base64')
  return base64
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

/* ------------------------------------------------------------------ *
 * PKCE parameter generation
 * ------------------------------------------------------------------ */

/**
 * Generate a Code_Verifier: random string, 43-128 chars, from the RFC 7636
 * unreserved set [A-Za-z0-9-._~]. Uses crypto.getRandomValues (Req 1.1, 1.5).
 * @param {number} [length=64]
 * @returns {string}
 * @throws {CryptoUnavailableError} if Web Crypto is unavailable (Req 1.6)
 * @throws {RangeError} if length is outside [43, 128]
 */
export function generateCodeVerifier (length = 64) {
  if (!Number.isInteger(length) || length < 43 || length > 128) {
    throw new RangeError('Code_Verifier length must be an integer between 43 and 128.')
  }
  return randomUnreservedString(length)
}

/**
 * Derive the S256 Code_Challenge: base64url(SHA-256(verifier)), no padding (Req 1.2).
 * @param {string} verifier
 * @returns {Promise<string>}
 * @throws {CryptoUnavailableError} if crypto.subtle is unavailable (Req 1.6)
 */
export async function deriveCodeChallenge (verifier) {
  const c = getCrypto()
  if (!c.subtle || typeof c.subtle.digest !== 'function') {
    throw new CryptoUnavailableError()
  }
  const data = new TextEncoder().encode(verifier)
  const digest = await c.subtle.digest('SHA-256', data)
  return base64UrlEncode(digest)
}

/**
 * Generate a State_Parameter: random string 16-128 chars from the unreserved
 * set [A-Za-z0-9-._~] (Req 1.3, 1.5).
 * @param {number} [length=32]
 * @returns {string}
 * @throws {CryptoUnavailableError} if Web Crypto is unavailable (Req 1.6)
 * @throws {RangeError} if length is outside [16, 128]
 */
export function generateState (length = 32) {
  if (!Number.isInteger(length) || length < 16 || length > 128) {
    throw new RangeError('State_Parameter length must be an integer between 16 and 128.')
  }
  return randomUnreservedString(length)
}
/* ------------------------------------------------------------------ *
 * PKCE session persistence (Req 1.4, 1.7)
 *
 * The verifier and state must survive the full-page redirect to Spotify
 * and back, so they are stored in sessionStorage (cleared when the tab
 * closes) rather than in memory.
 * ------------------------------------------------------------------ */

// sessionStorage keys.
const VERIFIER_KEY = 'WAVESYNC_PKCE_VERIFIER'
const STATE_KEY = 'WAVESYNC_PKCE_STATE'

/**
 * Persist the Code_Verifier and State_Parameter so they survive the redirect
 * round-trip (Req 1.4).
 * @param {string} verifier
 * @param {string} state
 * @throws {StoragePersistError} if the sessionStorage write fails (Req 1.7)
 */
export function persistPkceSession (verifier, state) {
  try {
    sessionStorage.setItem(VERIFIER_KEY, verifier)
    sessionStorage.setItem(STATE_KEY, state)
  } catch (err) {
    throw new StoragePersistError()
  }
}

/**
 * Read the persisted PKCE session. Either value may be null when nothing is
 * stored.
 * @returns {{ verifier: (string|null), state: (string|null) }}
 */
export function readPkceSession () {
  return {
    verifier: sessionStorage.getItem(VERIFIER_KEY),
    state: sessionStorage.getItem(STATE_KEY)
  }
}

/**
 * Remove the persisted verifier and state (Req 3.2, 3.3, 3.7, 3.9, 3.10).
 */
export function clearPkceSession () {
  sessionStorage.removeItem(VERIFIER_KEY)
  sessionStorage.removeItem(STATE_KEY)
}

/* ------------------------------------------------------------------ *
 * Authorize-URL construction (Req 2.1, 2.3, 2.4)
 * ------------------------------------------------------------------ */

/**
 * Build the Spotify authorize URL with URL-encoded query params (Req 2.1, 2.3).
 *
 * Params: response_type=code, client_id, redirect_uri, scope=PLAYBACK_SCOPE,
 * code_challenge_method=S256, code_challenge, state.
 *
 * @param {{ codeChallenge: string, state: string }} params
 * @returns {string} the fully-encoded authorize URL
 * @throws {MissingParamError} if codeChallenge or state is empty/absent (Req 2.4)
 */
export function buildAuthorizeUrl ({ codeChallenge, state } = {}) {
  if (!codeChallenge || !state) {
    throw new MissingParamError()
  }

  const url = new URL(AUTHORIZE_ENDPOINT)
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    scope: PLAYBACK_SCOPE,
    code_challenge_method: 'S256',
    code_challenge: codeChallenge,
    state: state
  })
  url.search = params.toString()
  return url.toString()
}

/* ------------------------------------------------------------------ *
 * Authorization-code token exchange (Req 3.4, 3.5, 3.9)
 * ------------------------------------------------------------------ */

/**
 * Exchange an authorization code for tokens against the Spotify token
 * endpoint using PKCE (Req 3.4).
 *
 * Posts an application/x-www-form-urlencoded body with grant_type,
 * code, redirect_uri, client_id, and code_verifier. No client secret and
 * no Basic Authorization header are sent — PKCE public-client flow (Req 3.5).
 * A 30 second timeout is applied (Req 3.9).
 *
 * @param {{ code: string, verifier: string }} params
 * @returns {Promise<object>} the parsed token response (contains access_token)
 * @throws {TokenExchangeError} on non-2xx, timeout/abort, network error, or a
 *   2xx response missing a non-empty access_token (Req 3.9)
 */
export async function exchangeCodeForTokens ({ code, verifier } = {}) {
  let result
  try {
    result = await post(TOKEN_ENDPOINT, {
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
      client_id: CLIENT_ID,
      code_verifier: verifier
    }, { timeoutMs: 30000 })
  } catch (err) {
    throw new TokenExchangeError()
  }

  const ok = result.success &&
    result.data &&
    typeof result.data.access_token === 'string' &&
    result.data.access_token.length > 0

  if (!ok) {
    throw new TokenExchangeError()
  }

  return result.data
}

/* ------------------------------------------------------------------ *
 * Login entry point and callback handling (Req 1, 2, 3)
 * ------------------------------------------------------------------ */

/**
 * Default browser navigator used by beginAuth. Assigns the authorize URL to
 * window.location so the full-page redirect to the Spotify_Authorize_Endpoint
 * happens. Guarded so the module can be imported in non-browser (test/SSR)
 * contexts without throwing at load time.
 * @param {string} url
 */
function defaultRedirect (url) {
  if (typeof window !== 'undefined' && window.location) {
    window.location.assign(url)
  }
}

/**
 * Full login entry point (Req 1.6, 1.7, 2.2, 2.4, 3.1).
 *
 * Generates a Code_Verifier, derives the S256 Code_Challenge, generates a
 * State_Parameter, persists the verifier + state so they survive the redirect
 * round-trip, builds the authorize URL, and finally invokes the injected
 * `redirect` callback to navigate the browser.
 *
 * On a Web Crypto failure (Req 1.6), a sessionStorage persist failure
 * (Req 1.7), or an empty challenge/state (Req 2.4), the flow aborts WITHOUT
 * navigating and returns `{ ok: false, error }` carrying the error message so
 * the caller (Home.vue) can surface it inline.
 *
 * @param {{ redirect?: (url: string) => void }} [deps]
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
export async function beginAuth ({ redirect } = {}) {
  const navigate = typeof redirect === 'function' ? redirect : defaultRedirect

  let url
  try {
    const verifier = generateCodeVerifier()
    const codeChallenge = await deriveCodeChallenge(verifier)
    const state = generateState()

    persistPkceSession(verifier, state)

    url = buildAuthorizeUrl({ codeChallenge, state })
  } catch (err) {
    // CryptoUnavailableError (Req 1.6), StoragePersistError (Req 1.7), or
    // MissingParamError (Req 2.4): abort without navigating.
    return { ok: false, error: err && err.message }
  }

  navigate(url)
  return { ok: true }
}

/**
 * Handle the Spotify authorization callback (Req 3.2, 3.3, 3.4, 3.6-3.10).
 *
 * `query` carries the parsed callback query params. All collaborators are
 * injectable so the flow can be unit-tested without touching window.location:
 * `tokenManager` defaults to the Token_Manager module, and `onSuccess` /
 * `onFailure` are optional navigation callbacks invoked only when functions.
 *
 * Order of checks:
 *  1. An `error` query param → clear session, report failure, go home (Req 3.10).
 *  2. A missing/empty `code` or `state` (and no error) → clear, report, go
 *     home (Req 3.2).
 *  3. Returned `state` not matching the persisted state → do NOT exchange,
 *     clear, report, go home (Req 3.3).
 *  4. On state match, exchange the code for tokens (Req 3.4); on success store
 *     tokens, clear the session, and signal success → /visualizer
 *     (Req 3.6, 3.7, 3.8); on any exchange failure/timeout/missing token,
 *     clear, report, go home (Req 3.9).
 *
 * @param {{
 *   query?: object,
 *   tokenManager?: { setTokens: Function },
 *   onSuccess?: Function,
 *   onFailure?: Function
 * }} [deps]
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
export async function handleCallback ({ query, tokenManager: tm = tokenManager, onSuccess, onFailure } = {}) {
  const q = query || {}

  const fail = (error) => {
    clearPkceSession()
    if (typeof onFailure === 'function') onFailure(error)
    return { ok: false, error: error }
  }

  // 1. Spotify reported an error on the callback (Req 3.10).
  if (q.error) {
    return fail(typeof q.error === 'string' && q.error.length > 0
      ? q.error
      : 'Spotify returned an authorization error.')
  }

  // 2. Missing required params and no error (Req 3.2).
  if (!q.code || !q.state) {
    return fail('The authorization callback is missing the required code or state parameter.')
  }

  // 3. Validate returned state against the persisted state (Req 3.3).
  const session = readPkceSession()
  if (q.state !== session.state) {
    return fail(new StateMismatchError().message)
  }

  // 4. State matches — exchange the code for tokens (Req 3.4).
  let resp
  try {
    resp = await exchangeCodeForTokens({ code: q.code, verifier: session.verifier })
  } catch (err) {
    // Non-2xx, timeout, network error, or missing access token (Req 3.9).
    return fail(err && err.message)
  }

  // Success: store tokens, clear the session, and signal success
  // (Req 3.6, 3.7, 3.8).
  tm.setTokens(resp)
  clearPkceSession()
  if (typeof onSuccess === 'function') onSuccess()
  return { ok: true }
}
