// Property-based test for refresh() routing when no refresh token is stored
// (task 5.8).
//
// Validates: Requirements 5.6

import fc from 'fast-check'
import { refresh } from '@/auth/tokens'

const ACCESS_KEY = 'WAVESYNC_ACCESS_TOKEN'
const REFRESH_KEY = 'WAVESYNC_REFRESH_TOKEN'

const originalFetch = global.fetch

afterEach(() => {
  jest.restoreAllMocks()
  global.fetch = originalFetch
  sessionStorage.clear()
})

describe('refresh with no refresh token stored (Property 13)', () => {
  // Feature: static-site-migration, Property 13: For any token state in which no refresh token is stored, invoking refresh SHALL make no network request and SHALL cause the application to navigate to the home route (returning a no_refresh_token indication).
  it('makes no network request and returns a no_refresh_token indication', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Any OTHER sessionStorage state that does NOT include a refresh token:
        // the access token may be present (a random string) or absent (null).
        fc.option(fc.string(), { nil: null }),
        async (accessToken) => {
          // Establish the "no refresh token stored" state for this run.
          sessionStorage.clear()
          sessionStorage.removeItem(REFRESH_KEY)
          if (accessToken !== null) {
            sessionStorage.setItem(ACCESS_KEY, accessToken)
          }

          // jsdom does not always expose a global `fetch`, so install a mock
          // function we can assert against (and detect any network attempt).
          const fetchSpy = jest
            .fn()
            .mockResolvedValue({ ok: true, json: async () => ({}) })
          global.fetch = fetchSpy

          const result = await refresh()

          // No network request may be made.
          expect(fetchSpy).not.toHaveBeenCalled()

          // Must signal the caller to navigate home.
          expect(result.ok).toBe(false)
          expect(result.reason).toBe('no_refresh_token')

          global.fetch = originalFetch
        }
      ),
      { numRuns: 100 }
    )
  })
})
