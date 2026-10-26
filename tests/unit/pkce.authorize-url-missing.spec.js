// Property-based test for empty/absent challenge or state aborting
// authorize-URL construction (task 3.9).
//
// Validates: Requirements 2.4

import fc from 'fast-check'
import { buildAuthorizeUrl, MissingParamError } from '@/auth/pkce'

describe('buildAuthorizeUrl missing-param handling (Property 6)', () => {
  // Generators for the "empty or absent" side: empty string, null, undefined.
  const emptyArb = fc.constantFrom('', null, undefined)
  // Generator for the "valid" side: a non-empty string.
  const nonEmptyArb = fc.string({ minLength: 1 })

  // Three shapes of invalid input, each with at least one empty/absent value:
  //  - empty challenge + valid state
  //  - valid challenge + empty state
  //  - both empty
  const invalidInputArb = fc.oneof(
    emptyArb.chain((codeChallenge) =>
      nonEmptyArb.map((state) => ({ codeChallenge, state }))
    ),
    nonEmptyArb.chain((codeChallenge) =>
      emptyArb.map((state) => ({ codeChallenge, state }))
    ),
    emptyArb.chain((codeChallenge) =>
      emptyArb.map((state) => ({ codeChallenge, state }))
    )
  )

  // Feature: static-site-migration, Property 9: For any input where the Code_Challenge OR the State_Parameter is empty or absent, buildAuthorizeUrl SHALL throw MissingParamError and SHALL NOT produce a URL.
  it('throws MissingParamError and produces no URL when challenge or state is empty/absent', () => {
    fc.assert(
      fc.property(invalidInputArb, (input) => {
        let result
        let thrown

        try {
          result = buildAuthorizeUrl(input)
        } catch (err) {
          thrown = err
        }

        // A URL must never be produced for these inputs.
        expect(result).toBeUndefined()
        // The failure must surface as a MissingParamError.
        expect(thrown).toBeInstanceOf(MissingParamError)
      }),
      { numRuns: 100 }
    )
  })
})
