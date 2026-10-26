// Unit tests for src/config.js (Build_Time_Config).
//
// config.js reads process.env.VUE_APP_* at module-load time and invokes
// loadConfig() on import, so each test manipulates process.env and then
// requires the module fresh via jest.resetModules() + require() to exercise
// load-time behavior in isolation.
//
// Covers Requirements 9.1, 9.2, 9.6.

const CLIENT_ID_VAR = 'VUE_APP_SPOTIFY_CLIENT_ID'
const REDIRECT_URI_VAR = 'VUE_APP_REDIRECT_URI'

describe('src/config.js Build_Time_Config', () => {
  let originalEnv

  beforeEach(() => {
    // Snapshot the relevant env so each test starts from a clean slate.
    originalEnv = {
      [CLIENT_ID_VAR]: process.env[CLIENT_ID_VAR],
      [REDIRECT_URI_VAR]: process.env[REDIRECT_URI_VAR]
    }
    jest.resetModules()
  })

  afterEach(() => {
    // Restore the original env values (deleting ones that were unset).
    for (const name of [CLIENT_ID_VAR, REDIRECT_URI_VAR]) {
      if (originalEnv[name] === undefined) {
        delete process.env[name]
      } else {
        process.env[name] = originalEnv[name]
      }
    }
    jest.resetModules()
  })

  /**
   * Set the two build-time env vars, then require config.js fresh so it reads
   * the values we just set at load time.
   */
  function loadWith (clientId, redirectUri) {
    if (clientId === undefined) {
      delete process.env[CLIENT_ID_VAR]
    } else {
      process.env[CLIENT_ID_VAR] = clientId
    }
    if (redirectUri === undefined) {
      delete process.env[REDIRECT_URI_VAR]
    } else {
      process.env[REDIRECT_URI_VAR] = redirectUri
    }

    // Reset the module registry so the require below re-executes config.js
    // (and its load-time loadConfig() call) against the env we just set.
    jest.resetModules()
    return require('../../src/config')
  }

  describe('CLIENT_ID / REDIRECT_URI reflect the VUE_APP_ env vars (Req 9.1, 9.2)', () => {
    it('exports CLIENT_ID from VUE_APP_SPOTIFY_CLIENT_ID', () => {
      const config = loadWith('client-abc-123', 'https://wavesync.example/callback')
      expect(config.CLIENT_ID).toBe('client-abc-123')
    })

    it('exports REDIRECT_URI from VUE_APP_REDIRECT_URI', () => {
      const config = loadWith('client-abc-123', 'https://wavesync.example/callback')
      expect(config.REDIRECT_URI).toBe('https://wavesync.example/callback')
    })

    it('returns the env-backed values from loadConfig()', () => {
      const config = loadWith('my-client', 'http://localhost:8080/callback')
      expect(config.loadConfig()).toEqual({
        clientId: 'my-client',
        redirectUri: 'http://localhost:8080/callback'
      })
    })
  })

  describe('loadConfig() throws naming the missing variable (Req 9.6)', () => {
    it('throws naming VUE_APP_SPOTIFY_CLIENT_ID when the client id is absent', () => {
      expect(() => loadWith(undefined, 'https://wavesync.example/callback'))
        .toThrow(CLIENT_ID_VAR)
    })

    it('throws naming VUE_APP_SPOTIFY_CLIENT_ID when the client id is an empty string', () => {
      expect(() => loadWith('', 'https://wavesync.example/callback'))
        .toThrow(CLIENT_ID_VAR)
    })

    it('throws naming VUE_APP_REDIRECT_URI when the redirect uri is absent', () => {
      expect(() => loadWith('client-abc-123', undefined))
        .toThrow(REDIRECT_URI_VAR)
    })

    it('throws naming VUE_APP_REDIRECT_URI when the redirect uri is an empty string', () => {
      expect(() => loadWith('client-abc-123', ''))
        .toThrow(REDIRECT_URI_VAR)
    })

    it('throws an Error instance when a required variable is missing', () => {
      expect(() => loadWith('', '')).toThrow(Error)
    })
  })

  describe('endpoint / scope constants have exact expected values', () => {
    it('exposes the Spotify endpoint and scope constants verbatim', () => {
      const config = loadWith('client-abc-123', 'https://wavesync.example/callback')
      expect(config.AUTHORIZE_ENDPOINT).toBe('https://accounts.spotify.com/authorize')
      expect(config.TOKEN_ENDPOINT).toBe('https://accounts.spotify.com/api/token')
      expect(config.PLAYBACK_SCOPE).toBe('user-read-playback-state')
    })
  })
})
