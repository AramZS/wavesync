// Unit tests for Web Crypto unavailability in src/auth/pkce.js (Req 1.6).
//
// pkce.js resolves the Web Crypto object via:
//   (typeof crypto !== 'undefined' && crypto) || (window && window.crypto)
// so to simulate an environment without Web Crypto we must override BOTH the
// global `crypto` and `window.crypto`. We save and restore the originals in
// beforeEach/afterEach so no other test suite is affected.
//
// src/config.js calls loadConfig() at import time and throws when the required
// VUE_APP_ env vars are absent, so we set them before requiring the module.

process.env.VUE_APP_SPOTIFY_CLIENT_ID = process.env.VUE_APP_SPOTIFY_CLIENT_ID || 'test-client-id'
process.env.VUE_APP_REDIRECT_URI = process.env.VUE_APP_REDIRECT_URI || 'http://localhost:8080/callback'

const {
  generateCodeVerifier,
  generateState,
  deriveCodeChallenge,
  CryptoUnavailableError
} = require('@/auth/pkce')

describe('pkce.js Web Crypto unavailability (Req 1.6)', () => {
  // Property descriptors so we can restore exactly what was there (including
  // "not present at all"), using Object.defineProperty for maximum control.
  let hadGlobalCrypto
  let originalGlobalCryptoDescriptor
  let hadWindowCrypto
  let originalWindowCryptoDescriptor

  function stubCrypto (value) {
    // global/global crypto
    Object.defineProperty(global, 'crypto', {
      value,
      configurable: true,
      writable: true
    })
    // window.crypto (jsdom) — the fallback branch in getCrypto()
    if (typeof window !== 'undefined') {
      Object.defineProperty(window, 'crypto', {
        value,
        configurable: true,
        writable: true
      })
    }
  }

  beforeEach(() => {
    // Snapshot the current crypto so we can restore it exactly.
    hadGlobalCrypto = Object.prototype.hasOwnProperty.call(global, 'crypto')
    originalGlobalCryptoDescriptor = Object.getOwnPropertyDescriptor(global, 'crypto')

    if (typeof window !== 'undefined') {
      hadWindowCrypto = Object.prototype.hasOwnProperty.call(window, 'crypto')
      originalWindowCryptoDescriptor = Object.getOwnPropertyDescriptor(window, 'crypto')
    }
  })

  afterEach(() => {
    // Restore global crypto.
    if (hadGlobalCrypto && originalGlobalCryptoDescriptor) {
      Object.defineProperty(global, 'crypto', originalGlobalCryptoDescriptor)
    } else {
      delete global.crypto
    }

    // Restore window.crypto.
    if (typeof window !== 'undefined') {
      if (hadWindowCrypto && originalWindowCryptoDescriptor) {
        Object.defineProperty(window, 'crypto', originalWindowCryptoDescriptor)
      } else {
        delete window.crypto
      }
    }
  })

  describe('crypto.getRandomValues unavailable', () => {
    it('generateCodeVerifier() throws CryptoUnavailableError when crypto is undefined', () => {
      stubCrypto(undefined)
      expect(() => generateCodeVerifier()).toThrow(CryptoUnavailableError)
    })

    it('generateCodeVerifier() throws CryptoUnavailableError when getRandomValues is missing', () => {
      stubCrypto({ /* no getRandomValues */ subtle: {} })
      expect(() => generateCodeVerifier()).toThrow(CryptoUnavailableError)
    })

    it('generateState() throws CryptoUnavailableError when crypto is undefined', () => {
      stubCrypto(undefined)
      expect(() => generateState()).toThrow(CryptoUnavailableError)
    })

    it('generateState() throws CryptoUnavailableError when getRandomValues is missing', () => {
      stubCrypto({ /* no getRandomValues */ subtle: {} })
      expect(() => generateState()).toThrow(CryptoUnavailableError)
    })
  })

  describe('crypto.subtle unavailable', () => {
    it('deriveCodeChallenge() rejects with CryptoUnavailableError when crypto is undefined', async () => {
      stubCrypto(undefined)
      await expect(deriveCodeChallenge('any-verifier')).rejects.toThrow(CryptoUnavailableError)
    })

    it('deriveCodeChallenge() rejects with CryptoUnavailableError when crypto.subtle is missing', async () => {
      // getRandomValues is present so getCrypto() resolves, but subtle is absent,
      // exercising the dedicated subtle-unavailable guard in deriveCodeChallenge.
      stubCrypto({ getRandomValues: () => {} /* no subtle */ })
      await expect(deriveCodeChallenge('any-verifier')).rejects.toThrow(CryptoUnavailableError)
    })

    it('deriveCodeChallenge() rejects with CryptoUnavailableError when subtle.digest is missing', async () => {
      stubCrypto({ getRandomValues: () => {}, subtle: { /* no digest */ } })
      await expect(deriveCodeChallenge('any-verifier')).rejects.toThrow(CryptoUnavailableError)
    })
  })
})
