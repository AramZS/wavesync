// Sample test to confirm the Jest + jsdom test harness is wired up correctly.
// This can be removed once real test suites exist.

describe('test harness wiring', () => {
  it('runs a basic assertion', () => {
    expect(1 + 1).toBe(2)
  })

  it('provides a jsdom environment with mockable browser globals', () => {
    // These globals are what the auth/token/sync code relies on being able
    // to read and mock. Their presence confirms testEnvironment: 'jsdom'.
    expect(typeof window).toBe('object')
    expect(typeof document).toBe('object')
    expect(typeof window.sessionStorage).toBe('object')
    expect(typeof document.cookie).toBe('string')

    // sessionStorage is mockable/usable
    window.sessionStorage.setItem('wiring', 'ok')
    expect(window.sessionStorage.getItem('wiring')).toBe('ok')
    window.sessionStorage.clear()
  })
})
