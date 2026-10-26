# Implementation Plan: Static Site Migration (Serverless PKCE)

## Overview

This plan re-architects WaveSync from a Vue 2 SPA backed by an Express OAuth server into a fully static, serverless SPA on Netlify using the Spotify Authorization Code with PKCE flow. Work lands bottom-up: test tooling and build-time config first, then the network/auth/token primitives (with property-based tests for P1-P13), then the view/router wiring, then the Sync_Engine migration, then Netlify/build config, and finally server removal and documentation. Each task builds on prior work so nothing is orphaned.

Implementation language is JavaScript / Vue 2 (as used throughout the design). Property-based tests use `fast-check` at a minimum of 100 iterations and are tagged `// Feature: static-site-migration, Property {n}: {text}`.

## Tasks

- [x] 1. Set up test tooling and build-time config foundation
  - [x] 1.1 Add and configure the test framework
    - Add dev dependencies: `@vue/cli-plugin-unit-jest`, `@vue/test-utils`, and `fast-check`
    - Add a `test:unit` script (`vue-cli-service test:unit`) to `package.json`
    - Add Jest configuration (via the Vue CLI jest preset / `jest.config.js`) with a `jsdom` test environment so `sessionStorage`, `document.cookie`, `crypto`, and `fetch` can be mocked
    - Verify an empty/sample test runs green to confirm wiring
    - _Requirements: 8.3_ (enables the Testing Strategy for all subsequent tasks)

  - [x] 1.2 Implement `src/config.js` Build_Time_Config module
    - Read `VUE_APP_SPOTIFY_CLIENT_ID` and `VUE_APP_REDIRECT_URI` from `process.env`
    - Export `CLIENT_ID`, `REDIRECT_URI`, and the constants `AUTHORIZE_ENDPOINT` (`https://accounts.spotify.com/authorize`), `TOKEN_ENDPOINT` (`https://accounts.spotify.com/api/token`), `PLAYBACK_SCOPE` (`user-read-playback-state`)
    - Implement `loadConfig()` returning `{ clientId, redirectUri }` and throwing an `Error` that names the offending variable when either value is absent or empty; invoke at module import so a misconfigured build fails loudly
    - _Requirements: 9.1, 9.2, 9.3_

  - [x] 1.3 Write unit tests for `src/config.js`
    - Assert `CLIENT_ID`/`REDIRECT_URI` reflect the `VUE_APP_` env vars (9.1, 9.2)
    - Assert `loadConfig()` throws naming the missing variable when either var is empty/absent (9.6)
    - Assert the endpoint/scope constants have the exact expected values
    - _Requirements: 9.1, 9.2, 9.6_

- [x] 2. Add the network `post()` helper
  - [x] 2.1 Implement `post()` in `src/util/network.js`
    - Add a `post(url, fields, opts)` helper that sends `application/x-www-form-urlencoded` bodies (encoded with `URLSearchParams`) and returns the existing `{ status, data, success }` shape
    - Leave the existing XHR `get()` unchanged (preserved for Spotify API polling)
    - _Requirements: 3.4, 5.2_

  - [ ]* 2.2 Write unit test for `post()`
    - Assert the request uses the form-urlencoded content type and encodes fields correctly
    - Assert the returned shape matches `{ status, data, success }`
    - _Requirements: 3.4, 5.2_

- [x] 3. Implement the Auth_Module PKCE primitives (`src/auth/pkce.js`)
  - [x] 3.1 Implement PKCE parameter generation and custom error types
    - Implement `generateCodeVerifier(length = 64)` producing a 43-128 char string from the RFC 7636 unreserved set `[A-Za-z0-9-._~]` using `crypto.getRandomValues`
    - Implement `deriveCodeChallenge(verifier)` returning base64url(SHA-256(verifier)) with no padding via `crypto.subtle`
    - Implement `generateState(length = 32)` producing a 16-128 char unreserved-set string
    - Define custom error types `CryptoUnavailableError`, `StoragePersistError`, `StateMismatchError`, `MissingParamError`, `TokenExchangeError`; throw `CryptoUnavailableError` when Web Crypto is unavailable
    - _Requirements: 1.1, 1.2, 1.3, 1.5, 1.6_

  - [x] 3.2 Write property test for Code_Verifier generation
    - `// Feature: static-site-migration, Property 1: For any requested length in [43, 128], the generated Code_Verifier SHALL have exactly that length and SHALL contain only characters from the RFC 7636 unreserved set [A-Za-z0-9-._~].`
    - Generator `fc.integer({ min: 43, max: 128 })`; assert exact length and charset; `{ numRuns: 100 }`
    - **Property 1 — Validates: Requirements 1.1**

  - [ ]* 3.3 Write property test for Code_Challenge derivation
    - `// Feature: static-site-migration, Property 2: For any Code_Verifier, deriving the Code_Challenge twice SHALL produce identical results, and the result SHALL be valid base64url (only [A-Za-z0-9-_], no +, /, or = padding).`
    - Random verifiers; assert twice-equal and base64url regex; `{ numRuns: 100 }`
    - **Property 2 — Validates: Requirements 1.2**

  - [ ]* 3.4 Write property test for State_Parameter generation
    - `// Feature: static-site-migration, Property 3: For any requested length in [16, 128], the generated State_Parameter SHALL have exactly that length and SHALL contain only characters from the unreserved set [A-Za-z0-9-._~].`
    - Generator `fc.integer({ min: 16, max: 128 })`; assert length and charset; `{ numRuns: 100 }`
    - **Property 3 — Validates: Requirements 1.3**

  - [x] 3.5 Write unit test for Web Crypto unavailability
    - Stub `crypto`/`crypto.subtle` as unavailable; assert generation throws `CryptoUnavailableError`
    - _Requirements: 1.6_

  - [x] 3.6 Implement PKCE session persistence and authorize-URL builder
    - Implement `persistPkceSession(verifier, state)` writing `WAVESYNC_PKCE_VERIFIER` / `WAVESYNC_PKCE_STATE` to `sessionStorage`, throwing `StoragePersistError` on write failure
    - Implement `readPkceSession()` returning `{ verifier, state }` and `clearPkceSession()` removing both keys
    - Implement `buildAuthorizeUrl({ codeChallenge, state })` producing a URL-encoded authorize URL targeting `AUTHORIZE_ENDPOINT` with `response_type=code`, `client_id`, `redirect_uri`, `scope=PLAYBACK_SCOPE`, `code_challenge_method=S256`, `code_challenge`, `state`; throw `MissingParamError` when challenge or state is empty/absent
    - _Requirements: 1.4, 1.7, 2.1, 2.3, 2.4_

  - [ ]* 3.7 Write property test for PKCE session round-trip
    - `// Feature: static-site-migration, Property 4: For any (verifier, state) pair, persisting them to session storage and then reading the persisted session SHALL return the same verifier and the same state.`
    - Random strings against a mocked `sessionStorage`; `{ numRuns: 100 }`
    - **Property 4 — Validates: Requirements 1.4**

  - [ ]* 3.8 Write property test for authorize-URL parameters and encoding
    - `// Feature: static-site-migration, Property 5: For any non-empty Code_Challenge and State_Parameter, the authorize URL SHALL target the Spotify_Authorize_Endpoint and contain exactly response_type=code, client_id, redirect_uri, scope, code_challenge_method=S256, code_challenge, and state; each value URL-encoded to decode back to the original; and scope SHALL decode to exactly the Playback_Scope.`
    - Random challenge/state including special chars; parse with `URL`/`URLSearchParams`; `{ numRuns: 100 }`
    - **Property 5 — Validates: Requirements 2.1, 2.3**

  - [x] 3.9 Write property test for empty challenge/state aborting URL construction
    - `// Feature: static-site-migration, Property 6: For any input in which the Code_Challenge or the State_Parameter is empty or absent, the Auth_Module SHALL abort authorize-URL construction and SHALL NOT invoke the browser navigator.`
    - Empty/missing inputs; spy navigator is never called; `{ numRuns: 100 }`
    - **Property 6 — Validates: Requirements 2.4**

  - [x] 3.10 Write unit test for sessionStorage persist failure
    - Stub `sessionStorage.setItem` to throw; assert `persistPkceSession` throws `StoragePersistError`
    - _Requirements: 1.7_

- [x] 4. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Implement the Token_Manager (`src/auth/tokens.js`)
  - [x] 5.1 Implement token store/read/clear
    - Implement `setTokens(resp)` writing `WAVESYNC_ACCESS_TOKEN` and (when present) rotating `WAVESYNC_REFRESH_TOKEN` in `sessionStorage`; when the response lacks a valid non-empty access token, retain existing tokens and return `{ ok: false }`, otherwise `{ ok: true }`
    - Implement `getAccessToken()` / `getRefreshToken()` returning the stored value or `null`
    - Implement `clearTokens()` removing both keys; never touch `document.cookie`
    - _Requirements: 4.1, 4.3, 4.4, 4.5, 4.6, 4.7_

  - [ ]* 5.2 Write property test for token store/read round-trip
    - `// Feature: static-site-migration, Property 9: For any token response containing a non-empty access token, calling setTokens and then getAccessToken SHALL return that same access token.`
    - Random tokens against mocked `sessionStorage`; `{ numRuns: 100 }`
    - **Property 9 — Validates: Requirements 4.3, 4.5**

  - [ ]* 5.3 Write property test for no cookie writes
    - `// Feature: static-site-migration, Property 10: For any token response, storing tokens SHALL leave document.cookie unchanged.`
    - Snapshot `document.cookie` before/after `setTokens`; `{ numRuns: 100 }`
    - **Property 10 — Validates: Requirements 4.1**

  - [ ]* 5.4 Write property test for refresh-token rotation
    - `// Feature: static-site-migration, Property 11: For any previously stored refresh token and any token response, after setTokens the stored refresh token SHALL equal the response's refresh_token when present, and SHALL equal the previously stored refresh token when the response omits it.`
    - Responses with/without `refresh_token`; `{ numRuns: 100 }`
    - **Property 11 — Validates: Requirements 4.6**

  - [ ]* 5.5 Write property test for invalid-response token retention
    - `// Feature: static-site-migration, Property 12: For any previously stored token state and any token response lacking a valid (non-empty) access token, setTokens SHALL leave the stored tokens unchanged and SHALL return a failure indication.`
    - Responses missing/empty `access_token`; `{ numRuns: 100 }`
    - **Property 12 — Validates: Requirements 4.7**

  - [ ]* 5.6 Write unit test for empty-storage access token
    - Assert `getAccessToken()` returns `null` when nothing is stored, leaving state unchanged
    - _Requirements: 4.4_

  - [x] 5.7 Implement `refresh()`
    - If no refresh token is stored, make no network request and return `{ ok: false, reason: 'no_refresh_token' }`
    - Otherwise POST form-urlencoded to `TOKEN_ENDPOINT` with `grant_type=refresh_token`, `refresh_token`, `client_id` (no client secret, no Basic auth) using `fetch` + `AbortController` with a 10s timeout
    - On 2xx with a non-empty access token, call `setTokens(resp)` and return `{ ok: true }`; on non-2xx, empty access token, or timeout return `{ ok: false }`
    - _Requirements: 5.2, 5.3, 5.4, 5.6, 5.7, 5.8_

  - [x] 5.8 Write property test for absent-refresh-token routing
    - `// Feature: static-site-migration, Property 13: For any token state in which no refresh token is stored, invoking refresh SHALL make no network request and SHALL cause the application to navigate to the home route (returning a no_refresh_token indication).`
    - Empty refresh state; spy `fetch` never called; assert `no_refresh_token`; `{ numRuns: 100 }`
    - **Property 13 — Validates: Requirements 5.6**

  - [ ]* 5.9 Write property test for no client secret on refresh requests
    - `// Feature: static-site-migration, Property 8: For any token request (authorization-code exchange or refresh), the request SHALL NOT include a client_secret field in its body and SHALL NOT include an HTTP Basic Authorization header.`
    - Assert refresh request body/headers lack `client_secret`/Basic across random inputs; `{ numRuns: 100 }` (exchange side covered in 6.x)
    - **Property 8 — Validates: Requirements 3.5, 5.3**

  - [ ]* 5.10 Write unit tests for refresh failure branches
    - Assert `{ ok: false }` on non-2xx and on 2xx-without-access-token (5.7)
    - Assert the 10s `AbortController` timeout yields `{ ok: false }` (5.8)
    - Assert the refresh request body contains exactly `grant_type`, `refresh_token`, `client_id` (5.2)
    - _Requirements: 5.2, 5.7, 5.8_

- [x] 6. Implement the authorization-code exchange and callback handling (`src/auth/pkce.js`)
  - [x] 6.1 Implement `exchangeCodeForTokens`
    - POST form-urlencoded to `TOKEN_ENDPOINT` with `grant_type=authorization_code`, `code`, `redirect_uri`, `client_id`, `code_verifier` using `fetch` + `AbortController` with a 30s timeout; send no client secret and no Basic auth header
    - Resolve with the `SpotifyTokenResponse`; throw `TokenExchangeError` on non-2xx, timeout, or missing access token
    - _Requirements: 3.4, 3.5, 3.9_

  - [ ]* 6.2 Write property test for no client secret on exchange requests
    - `// Feature: static-site-migration, Property 8: For any token request (authorization-code exchange or refresh), the request SHALL NOT include a client_secret field in its body and SHALL NOT include an HTTP Basic Authorization header.`
    - Assert exchange request body/headers lack `client_secret`/Basic across random inputs; `{ numRuns: 100 }`
    - **Property 8 — Validates: Requirements 3.5, 5.3**

  - [x] 6.3 Implement `handleCallback` and `beginAuth`
    - `handleCallback({ query, tokenManager, onSuccess, onFailure })`: if an `error` query param is present, clear the PKCE session, report, and go home (3.10); if `code`/`state` missing and no `error`, clear, report, go home (3.2); validate returned `state` equals persisted state, on mismatch do not exchange, clear, report, go home (3.3); on match call `exchangeCodeForTokens`, and on success `tokenManager.setTokens(resp)`, clear the PKCE session, and invoke `onSuccess` (3.4, 3.6, 3.7, 3.8); on any exchange failure/timeout/missing token clear, report, and go home (3.9)
    - `beginAuth({ redirect })`: generate verifier/challenge/state, persist, build the authorize URL, then invoke the injected `redirect`; on crypto/storage/missing-param failure abort without navigating and return `{ ok: false, error }` (1.6, 1.7, 2.4)
    - _Requirements: 1.6, 1.7, 2.2, 2.4, 3.1, 3.2, 3.3, 3.4, 3.6, 3.7, 3.8, 3.9, 3.10_

  - [ ]* 6.4 Write property test for state-mismatch rejection
    - `// Feature: static-site-migration, Property 7: For any pair of returned and persisted State_Parameter values that are not equal, the Auth_Module SHALL NOT perform a token exchange and SHALL clear the persisted PKCE session and route to the home path.`
    - Random unequal state pairs; spy exchange never called; assert session cleared and `onFailure`/home routing; `{ numRuns: 100 }`
    - **Property 7 — Validates: Requirements 3.3**

  - [ ]* 6.5 Write unit tests for callback and beginAuth branches
    - Callback: missing params (3.2), `error` param (3.10), exchange non-2xx / missing token / 30s timeout clear session + go home (3.9), success clears session (3.7) and calls `onSuccess` → `/visualizer` (3.8), exchange request body fields exact (3.4)
    - beginAuth: crypto unavailable (1.6) and storage failure (1.7) abort without redirect; `animationend`-driven redirect fires via the injected navigator (2.2)
    - _Requirements: 1.6, 1.7, 2.2, 3.2, 3.4, 3.7, 3.8, 3.9, 3.10_

- [x] 7. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Wire routing and views
  - [x] 8.1 Add the `/callback` route and keep history mode
    - Add `{ path: '/callback', name: 'callback', component: Callback }` to `src/router.js`
    - Keep vue-router in history mode with `base: process.env.BASE_URL`
    - _Requirements: 3.1, 7.2, 7.4_

  - [x] 8.2 Create `src/pages/Callback.vue`
    - Render a "Finishing sign-in..." message, or the error when present
    - On `mounted`, call `handleCallback` with `query: this.$route.query`, the Token_Manager, `onSuccess` → `this.$router.replace('/visualizer')`, and `onFailure` → show the error and route home after a short delay
    - _Requirements: 3.2, 3.3, 3.8, 3.9, 3.10_

  - [x] 8.3 Update `src/pages/Home.vue` to use `beginAuth`
    - Remove the broken `import { auth } from '@/wavesync/sync'` and the `{PROJECT_ROOT}/auth` + `/login` network calls (drop the now-unused `get` import)
    - Import `beginAuth`; in the login handler set `loading = true`, wait for the existing `animationend` on the container, then call `beginAuth({ redirect })` so navigation happens within 500ms of the animation completing
    - On `{ ok: false }`, clear `loading` and show an inline error message
    - Preserve the fixed-mode demo (`new WaveSync({ fixed: true })` in `mounted`)
    - _Requirements: 1.6, 1.7, 2.2, 2.4, 6.6_

  - [ ]* 8.4 Write integration test for the callback flow
    - Mount `Callback.vue` with a stubbed router and mocked token endpoint; assert success routes to `/visualizer` and failures (missing params, state mismatch, `error` param, exchange failure) route home
    - _Requirements: 3.2, 3.3, 3.8, 3.9, 3.10_

  - [ ]* 8.5 Write unit test for Home.vue login behavior
    - Assert `animationend` triggers `beginAuth` via the injected navigator (2.2) and that a `beginAuth` failure surfaces an inline error without navigating (1.6, 1.7, 2.4)
    - _Requirements: 1.6, 1.7, 2.2, 2.4_

- [x] 9. Migrate the Sync_Engine to Token_Manager (`src/wavesync/sync.js`)
  - [x] 9.1 Replace cookie token reads with Token_Manager and migrate the 401 refresh path
    - Remove `import * as cookies from '../util/cookie'`; import `getAccessToken` and `refresh` from the Token_Manager
    - Build the `Authorization: Bearer <token>` header from `getAccessToken()`; drop the `tokens.refreshCode` server-era artifact and all `SPOTIFY_*` cookie reads/writes
    - Replace `getNewToken()` with a delegation to `Token_Manager.refresh()`: on `{ ok: true }` rebuild the auth header and resume polling on the next interval; on `{ ok: false }` / `no_refresh_token` / timeout navigate home via an injected navigation callback (default routes to `/`)
    - Preserve all other behavior: `fixed` flag + `buildStaticIntervals()` home demo, 2500ms `pingDelay`, endpoints `/me/player`, `/audio-analysis/{id}`, `/audio-features/{id}`, interval processing, and the `tick()` loop
    - _Requirements: 5.1, 5.5, 5.6, 5.7, 5.8, 6.1, 6.2, 6.3, 6.4, 6.6, 10.5_

  - [ ]* 9.2 Write unit tests for Sync_Engine token integration
    - Assert the 401 path triggers `refresh()` before the next poll and resumes with the new token (5.1, 5.5); refresh failure / no-refresh-token navigates home (5.6, 5.7, 5.8)
    - Assert preserved behavior: new-track analysis/features fetch (6.2), no-playback state at the 2500ms ping (6.4), fixed-mode demo intervals (6.6)
    - _Requirements: 5.1, 5.5, 5.6, 5.7, 5.8, 6.2, 6.4, 6.6_

- [x] 10. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. Build and deployment configuration
  - [x] 11.1 Update `vue.config.js` with the build-time guard
    - Drop `dotenv` and the `PROJECT_ROOT` define injection
    - Add a guard that collects missing `VUE_APP_SPOTIFY_CLIENT_ID` / `VUE_APP_REDIRECT_URI` and throws a naming error (failing the build with a non-zero exit) when any is absent/empty
    - Preserve the existing sass `imports.scss` loader option
    - _Requirements: 8.4, 9.4, 9.6_

  - [x] 11.2 Add Netlify SPA fallback and build config
    - Add `netlify.toml` at the repo root with `[build]` command `npm run build`, publish `dist`, and a `[[redirects]]` rule `/* -> /index.html` status `200`
    - Add `public/_redirects` containing `/*  /index.html  200` as a defensive backup
    - _Requirements: 7.1, 7.3, 7.4, 7.5, 7.6, 8.1, 8.2_

  - [ ]* 11.3 Write static/smoke checks for Netlify and router config
    - Assert `netlify.toml` declares build command `npm run build`, publish `dist`, and the `/* -> /index.html 200` rewrite; assert `public/_redirects` matches
    - Assert `router.mode === 'history'`
    - _Requirements: 7.1, 7.2, 8.1, 8.2_

- [x] 12. Remove server infrastructure and update package.json
  - [x] 12.1 Delete the server directory and update dependencies/scripts
    - Delete the entire `server/` directory (`index.js` and the `auth`, `login`, `callback`, `refresh` routes)
    - Remove dependencies `express`, `cookie-parser`, `compression`, `express-history-api-fallback`, `request`, `dotenv`, `concurrently`, and `querystring` from `package.json`
    - Remove the `start` script; set `serve` to `vue-cli-service serve` (no Node server); keep `build` and `lint`
    - Delete `src/util/cookie.js` after confirming no remaining module imports it
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_

  - [ ]* 12.2 Write a repo-scan test for server/config cleanup
    - Assert no client secret / `CLIENT_SECRET` in source (9.3), no `PROJECT_ROOT` references (9.4), no `SPOTIFY_ACCESS_TOKEN` / `SPOTIFY_REFRESH_TOKEN` / `SPOTIFY_REFRESH_CODE` / `SPOTIFY_AUTH_ID` cookie keys in browser code (10.5), and `server/` is absent (10.1)
    - _Requirements: 9.3, 9.4, 10.1, 10.5_

- [x] 13. Documentation and environment example
  - [x] 13.1 Add `.env.example`
    - Document `VUE_APP_SPOTIFY_CLIENT_ID` and `VUE_APP_REDIRECT_URI`, with the local redirect value `http://localhost:8080/callback`
    - _Requirements: 9.1, 9.2, 9.5, 11.3_

  - [x] 13.2 Rewrite `README.md` for the serverless Netlify setup
    - Document two copyable Redirect URI entries (deployed Netlify domain `/callback` and `http://localhost:8080/callback`), the Netlify build command verbatim `npm run build`, publish directory verbatim `dist`, and both required `VUE_APP_` variable names to set in the Netlify UI
    - Remove every reference to a client secret / `CLIENT_SECRET` and to the Express server (`npm run start`, server-side callback route)
    - _Requirements: 11.1, 11.2, 11.3, 11.4_

- [x] 14. Final verification
  - [x] 14.1 Run full verification suite
    - Run `npm run build` and `npm run lint` and confirm both succeed with no Node server process (8.3, 10.6)
    - Run the complete test suite (unit + property + integration) and confirm all pass
    - Perform a repo scan confirming no client secret (9.3), no `PROJECT_ROOT` (9.4), no server cookie keys (10.5), and `server/` removed (10.1)
    - _Requirements: 8.3, 9.3, 9.4, 10.1, 10.5, 10.6_

- [ ]* 15. Manual deployment verification (manual / external — not a coding task)
  - Register both redirect URIs in the Spotify Developer Dashboard and set both `VUE_APP_` env vars in the Netlify UI (manual)
  - After deploy, confirm via direct URL entry that `/visualizer` and `/callback?code=...&state=...` resolve through SPA fallback, an existing asset serves without rewrite, and a full login round-trip reaches the visualizer (manual)
  - _Requirements: 7.3, 7.4, 7.5, 7.6, 11.1_

## Notes

- Tasks marked with `*` are optional (tests, static checks, and manual/external steps) and can be skipped for a faster MVP; core implementation tasks are never optional.
- Property-based tests cover all 13 correctness properties (P1-P13); each runs at a minimum of 100 iterations and is tagged `// Feature: static-site-migration, Property {n}: {text}`. Property 8 (no client secret) is split across the refresh path (5.9) and the exchange path (6.2) since it applies to both token requests.
- Each task references specific sub-requirements for traceability; checkpoints provide incremental validation points.
- Task 15 is purely manual/external (Netlify UI, Spotify Dashboard, deploy verification) and cannot be completed by a coding agent.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1"] },
    { "id": 1, "tasks": ["1.2", "2.2", "3.1"] },
    { "id": 2, "tasks": ["1.3", "3.2", "3.3", "3.4", "3.5", "3.6"] },
    { "id": 3, "tasks": ["3.7", "3.8", "3.9", "3.10", "5.1", "11.1", "11.2"] },
    { "id": 4, "tasks": ["5.2", "5.3", "5.4", "5.5", "5.6", "5.7", "11.3"] },
    { "id": 5, "tasks": ["5.8", "5.9", "5.10", "6.1"] },
    { "id": 6, "tasks": ["6.2", "6.3"] },
    { "id": 7, "tasks": ["6.4", "6.5", "8.1", "8.2"] },
    { "id": 8, "tasks": ["8.3", "8.4", "9.1"] },
    { "id": 9, "tasks": ["8.5", "9.2", "12.1", "13.1"] },
    { "id": 10, "tasks": ["12.2", "13.2"] },
    { "id": 11, "tasks": ["14.1", "15"] }
  ]
}
```
