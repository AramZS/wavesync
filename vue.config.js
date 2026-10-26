// Build-time config guard.
//
// Vue CLI statically injects VUE_APP_*-prefixed env vars into the client
// bundle, so no dotenv call or custom define injection is needed here. We fail
// the build loudly (non-zero exit) when a required variable is absent or empty
// so a misconfigured build never silently ships (Req 8.4, 9.4, 9.6).
//
// The guard is scoped to the `build` command only: vue-cli-service loads this
// file for every subcommand (serve, test:unit, lint, build), but the Req 9.6
// fail-fast requirement applies to the production build. Unit tests supply
// their own config via tests/setup-env.js, and local `serve` can run with a
// developer's own environment, so neither should be blocked here.

const REQUIRED_BUILD_VARS = ['VUE_APP_SPOTIFY_CLIENT_ID', 'VUE_APP_REDIRECT_URI']

const isBuild = process.argv.indexOf('build') !== -1

if (isBuild) {
  const missing = REQUIRED_BUILD_VARS.filter((name) => {
    const value = process.env[name]
    return typeof value !== 'string' || value.length === 0
  })

  if (missing.length > 0) {
    throw new Error(`Missing required build-time config: ${missing.join(', ')}`)
  }
}

module.exports = {
  css: {
    loaderOptions: {
      // sass-loader 13 renamed `data` to `additionalData`. This prepends the
      // shared sass imports (variables/mixins) to every scss block, including
      // the `lang="scss"` blocks inside .vue single-file components.
      scss: {
        additionalData: `@import "@/sass/imports.scss";`
      }
    }
  }
}
