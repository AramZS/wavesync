// Build_Time_Config
//
// Reads and validates the two required build-time variables. Vue CLI
// statically replaces process.env.VUE_APP_* at build time, so these values are
// baked into the client bundle. loadConfig() fails fast so a misconfigured
// build does not silently ship (Req 9.1, 9.2, 9.6).

// Spotify endpoints (constants, not env):
export const AUTHORIZE_ENDPOINT = 'https://accounts.spotify.com/authorize'
export const TOKEN_ENDPOINT = 'https://accounts.spotify.com/api/token'
export const PLAYBACK_SCOPE = 'user-read-playback-state'

// Build-time config values sourced from VUE_APP_-prefixed env vars (Req 9.1, 9.2).
export const CLIENT_ID = process.env.VUE_APP_SPOTIFY_CLIENT_ID
export const REDIRECT_URI = process.env.VUE_APP_REDIRECT_URI

/**
 * Reads the VUE_APP_ build-time config and validates it.
 *
 * @returns {{ clientId: string, redirectUri: string }}
 * @throws {Error} if a required value is absent or empty, naming the offending variable.
 */
export function loadConfig () {
  const required = {
    VUE_APP_SPOTIFY_CLIENT_ID: CLIENT_ID,
    VUE_APP_REDIRECT_URI: REDIRECT_URI
  }

  for (const name in required) {
    const value = required[name]
    if (typeof value !== 'string' || value.length === 0) {
      throw new Error(`Missing required build-time config: ${name}`)
    }
  }

  return {
    clientId: CLIENT_ID,
    redirectUri: REDIRECT_URI
  }
}

// Invoke at module import so a misconfigured build fails loudly (Req 9.6).
loadConfig()
