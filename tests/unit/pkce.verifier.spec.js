// Property-based test for Code_Verifier generation (task 3.2).
//
// Validates: Requirements 1.1

import fc from 'fast-check'
import { generateCodeVerifier } from '@/auth/pkce'

// The PKCE primitives rely on crypto.getRandomValues. jsdom usually exposes it,
// but on some Node versions the jsdom global `crypto` lacks getRandomValues.
// Fall back to Node's webcrypto so the generator has a working source of
// randomness without changing what the code under test actually exercises.
beforeAll(() => {
  const hasGetRandomValues =
    typeof global.crypto !== 'undefined' &&
    global.crypto !== null &&
    typeof global.crypto.getRandomValues === 'function'

  if (!hasGetRandomValues) {
    // eslint-disable-next-line global-require
    const { webcrypto } = require('crypto')
    global.crypto = webcrypto
  }
})

describe('generateCodeVerifier (Property 1)', () => {
  // Feature: static-site-migration, Property 1: For any requested length in [43, 128], the generated Code_Verifier SHALL have exactly that length and SHALL contain only characters from the RFC 7636 unreserved set [A-Za-z0-9-._~].
  it('produces a verifier of the exact requested length using only unreserved characters', () => {
    const unreserved = /^[A-Za-z0-9\-._~]+$/

    fc.assert(
      fc.property(fc.integer({ min: 43, max: 128 }), (length) => {
        const verifier = generateCodeVerifier(length)

        expect(verifier).toHaveLength(length)
        expect(verifier).toMatch(unreserved)
      }),
      { numRuns: 100 }
    )
  })
})
