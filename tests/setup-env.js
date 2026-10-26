// Jest setupFiles entry — runs before each test suite's module graph is
// evaluated, so build-time config is present when src/config.js calls
// loadConfig() at import time.
//
// src/config.js reads VUE_APP_-prefixed build-time variables and throws from
// loadConfig() when either is absent. Tests import modules (e.g. src/auth/pkce)
// that transitively import src/config, so without these defaults the suite
// fails to even load. We only set defaults when the variable is not already
// provided, so a test that deliberately exercises missing-config behaviour can
// still override/delete them.

if (!process.env.VUE_APP_SPOTIFY_CLIENT_ID) {
  process.env.VUE_APP_SPOTIFY_CLIENT_ID = 'test-client-id'
}
if (!process.env.VUE_APP_REDIRECT_URI) {
  process.env.VUE_APP_REDIRECT_URI = 'http://localhost:8080/callback'
}
