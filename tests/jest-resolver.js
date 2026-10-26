// Custom Jest resolver.
//
// The Vue CLI 3 preset pins Jest 23, whose module resolver predates Node's
// package `exports` field. Modern dependencies (fast-check v4 and its
// pure-rand dependency) only advertise their entry points through an exports
// map, so Jest 23's default resolver fails to find them.
//
// This resolver uses `enhanced-resolve` (already present in the dependency
// tree) with the CommonJS export conditions to resolve exports-map packages.
// For everything else it prefers Jest's own default resolver, but it must
// tolerate being called WITHOUT `options.defaultResolver`: Jest 23's
// `Resolver.findNodeModule` (used when validating `transform` entries such as
// `vue-jest`) invokes the custom resolver with no `defaultResolver`, so a
// resolver that blindly calls `options.defaultResolver(...)` throws, the error
// is swallowed, and Jest reports "Module <name> not found". We fall back to an
// exports-aware resolve in that case.

const enhancedResolve = require('enhanced-resolve')

const commonjsResolver = enhancedResolve.create.sync({
  conditionNames: ['require', 'node', 'default'],
  extensions: ['.js', '.json', '.node']
})

// Bare-specifier packages whose entry points are only reachable through an
// `exports` map and whose `main`/`module` fields point at ESM. For these we
// must resolve via the exports-aware resolver so the CommonJS build is picked
// up; Jest 23's default resolver would otherwise return the ESM entry and the
// (CommonJS) runtime would fail on the `import` statement.
const EXPORTS_MAP_PACKAGES = /^(fast-check|pure-rand)(\/|$)/

module.exports = function (request, options) {
  if (EXPORTS_MAP_PACKAGES.test(request)) {
    try {
      return commonjsResolver(options.basedir, request)
    } catch (err) {
      // Fall through to the generic resolution below if the exports-aware
      // resolution unexpectedly fails.
    }
  }

  // Preferred path: Jest provides its default resolver (test-module
  // resolution, the `@/` alias, core modules, every other dependency).
  if (typeof options.defaultResolver === 'function') {
    return options.defaultResolver(request, options)
  }

  // Fallback path: Jest 23's `Resolver.findNodeModule` calls this resolver
  // WITHOUT a `defaultResolver` (e.g. when validating `transform` modules like
  // `vue-jest`). Resolve from the given basedir using the exports-aware
  // resolver so transform/setup module validation succeeds.
  return commonjsResolver(options.basedir || process.cwd(), request)
}
