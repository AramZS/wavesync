# WaveSync

A fully static Spotify visualizer built with Vue 2. WaveSync authenticates with Spotify using the [Authorization Code with PKCE](https://developer.spotify.com/documentation/web-api/tutorials/code-pkce-flow) flow — there is no backend and nothing confidential to store, so everything runs in the browser and deploys as static files on Netlify.

## Spotify Developer Dashboard setup

1. Create a new app in your [Spotify Developer Dashboard](https://developer.spotify.com/dashboard/) and note its **Client ID**. The PKCE flow authenticates with the Client ID alone.
2. Register **two** Redirect URIs on the app. Add each value exactly, on its own line. Replace `<your-netlify-domain>` with the domain of your deployed Netlify site:

   ```
   https://<your-netlify-domain>/callback
   ```

   ```
   http://localhost:8080/callback
   ```

## Local development

1. Copy the example environment file and fill in your values:

   ```bash
   cp .env.example .env
   ```

   Set the following in `.env`:

   ```
   VUE_APP_SPOTIFY_CLIENT_ID=your_client_id_here
   VUE_APP_REDIRECT_URI=http://localhost:8080/callback
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Start the dev server:

   ```bash
   npm run serve
   ```

4. Visit [http://localhost:8080](http://localhost:8080) and log in with your Spotify account. Play a song in your Spotify client of choice — the visualizer takes a moment to sync before initializing.

## Deploy to Netlify

Configure the Netlify build with these exact values:

- **Build command:**

  ```
  npm run build
  ```

- **Publish directory:**

  ```
  dist
  ```

Set both of the following `VUE_APP_`-prefixed environment variables in the Netlify UI (both are **required**):

- `VUE_APP_SPOTIFY_CLIENT_ID` — **required** — your Spotify app's Client ID.
- `VUE_APP_REDIRECT_URI` — **required** — set to:

  ```
  https://<your-netlify-domain>/callback
  ```

The build fails loudly if either variable is missing or empty.

### SPA fallback

WaveSync is a single-page app using vue-router in history mode. A rewrite rule serves `index.html` for all paths so that deep links and the OAuth `/callback` route resolve correctly. This is configured in `netlify.toml` (with a defensive backup in `public/_redirects`):

```
/*  /index.html  200
```

## Scripts

All scripts run through `vue-cli-service`:

- `npm run serve` — start the local development server
- `npm run build` — build the production static bundle into `dist`
- `npm run lint` — lint the source
- `npm run test:unit` — run the unit and property-based test suite
