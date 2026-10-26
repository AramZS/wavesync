// src/auth/tokens.js
//
// Token_Manager (Req 4, 5).
// Owns token persistence in sessionStorage. Tokens live only in
// sessionStorage and are never written to or read from document.cookie
// (Req 4.1); closing the tab discards them, which naturally satisfies Req 4.2.
//
// This file currently implements the store/read/clear primitives
// (setTokens / getAccessToken / getRefreshToken / clearTokens). The async
// refresh() exchange lands in a later task (5.7) and slots in alongside
// these functions without changing them.

import { CLIENT_ID, TOKEN_ENDPOINT } from '../config'
import { post } from '../util/network'

// sessionStorage keys.
const ACCESS_KEY = 'WAVESYNC_ACCESS_TOKEN'
const REFRESH_KEY = 'WAVESYNC_REFRESH_TOKEN'

/**
 * True when `value` is a non-empty string.
 * @param {*} value
 * @returns {boolean}
 */
function isNonEmptyString (value) {
  return typeof value === 'string' && value.length > 0
}

/**
 * Store the access token and (when present) rotate the refresh token from a
 * Spotify token response (Req 4.5, 4.6).
 *
 * A valid response carries a non-empty `access_token` string. When the
 * response lacks one, no stored token is modified and the call returns
 * `{ ok: false }` (Req 4.7). Otherwise the access token replaces any previous
 * value (Req 4.5); the refresh token is replaced only when the response
 * includes a non-empty one (rotation), and is left unchanged when the response
 * omits it — refresh responses may not return a new refresh token (Req 4.6).
 *
 * @param {SpotifyTokenResponse} resp
 * @returns {{ ok: boolean }}
 */
export function setTokens (resp) {
  if (!resp || !isNonEmptyString(resp.access_token)) {
    return { ok: false }
  }

  sessionStorage.setItem(ACCESS_KEY, resp.access_token)

  if (isNonEmptyString(resp.refresh_token)) {
    sessionStorage.setItem(REFRESH_KEY, resp.refresh_token)
  }

  return { ok: true }
}

/**
 * Return the stored Access_Token, or null when none is stored (Req 4.3, 4.4).
 * @returns {string | null}
 */
export function getAccessToken () {
  return sessionStorage.getItem(ACCESS_KEY)
}

/**
 * Return the stored Refresh_Token, or null when none is stored.
 * @returns {string | null}
 */
export function getRefreshToken () {
  return sessionStorage.getItem(REFRESH_KEY)
}

/**
 * Remove both the access and refresh tokens from sessionStorage. Never touches
 * document.cookie (Req 4.1).
 */
export function clearTokens () {
  sessionStorage.removeItem(ACCESS_KEY)
  sessionStorage.removeItem(REFRESH_KEY)
}

// Refresh request timeout (Req 5.8).
const REFRESH_TIMEOUT_MS = 10000

/**
 * Exchange the stored Refresh_Token for a fresh Access_Token (Req 5.2-5.8).
 *
 * When no refresh token is stored, no network request is made and
 * `{ ok: false, reason: 'no_refresh_token' }` is returned so the caller can
 * route home (Req 5.6). Otherwise a form-urlencoded POST is sent to the
 * Spotify_Token_Endpoint carrying `grant_type=refresh_token`, the stored
 * `refresh_token`, and `client_id` — never a client secret and never a Basic
 * Authorization header (Req 5.3). The request is bounded by a 10 second
 * timeout (Req 5.8).
 *
 * On an HTTP 2xx response carrying a non-empty `access_token`, the tokens are
 * persisted via setTokens and `{ ok: true }` is returned (Req 5.4). On a
 * non-2xx response, a 2xx response lacking a non-empty access token, a timeout
 * (abort), or any network error, `{ ok: false }` is returned — this function
 * never throws, because callers rely on the returned object (Req 5.7, 5.8).
 *
 * @returns {Promise<{ ok: boolean, reason?: string }>}
 */
export async function refresh () {
  const refreshToken = getRefreshToken()

  if (!isNonEmptyString(refreshToken)) {
    return { ok: false, reason: 'no_refresh_token' }
  }

  try {
    const result = await post(TOKEN_ENDPOINT, {
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: CLIENT_ID
    }, { timeoutMs: REFRESH_TIMEOUT_MS })

    if (result.success && isNonEmptyString(result.data && result.data.access_token)) {
      setTokens(result.data)
      return { ok: true }
    }

    return { ok: false }
  } catch (err) {
    // Timeout (AbortError) or network error — map to a failure result rather
    // than propagating, so the caller can navigate home (Req 5.7, 5.8).
    return { ok: false, reason: 'request_failed' }
  }
}
