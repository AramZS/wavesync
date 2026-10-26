// Unit test for PKCE session persistence (task 3.10).
//
// Covers persistPkceSession(verifier, state): it writes the verifier and state
// to sessionStorage, and throws StoragePersistError when the sessionStorage
// write fails (e.g. a quota or security error).
//
// Validates: Requirements 1.7

import { persistPkceSession, readPkceSession, StoragePersistError } from '@/auth/pkce'

const VERIFIER_KEY = 'WAVESYNC_PKCE_VERIFIER'
const STATE_KEY = 'WAVESYNC_PKCE_STATE'

describe('persistPkceSession (Req 1.7)', () => {
  afterEach(() => {
    // Restore any spies and clear storage so suites stay isolated.
    jest.restoreAllMocks()
    sessionStorage.clear()
  })

  it('throws StoragePersistError when the sessionStorage write fails', () => {
    // Simulate a quota/security error on write.
    jest
      .spyOn(window.Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new Error('quota')
      })

    expect(() => persistPkceSession('some-verifier', 'some-state')).toThrow(
      StoragePersistError
    )
  })

  it('persists both values and does not throw on the happy path', () => {
    expect(() => persistPkceSession('some-verifier', 'some-state')).not.toThrow()

    // Verify the values landed under the expected keys...
    expect(sessionStorage.getItem(VERIFIER_KEY)).toBe('some-verifier')
    expect(sessionStorage.getItem(STATE_KEY)).toBe('some-state')

    // ...and that readPkceSession round-trips them.
    expect(readPkceSession()).toEqual({
      verifier: 'some-verifier',
      state: 'some-state'
    })
  })
})
