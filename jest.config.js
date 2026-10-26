// Jest config layered on the Vue CLI 5 unit-jest preset (Jest 27).
//
// The preset configures the vue-jest transform, the jsdom test environment,
// moduleFileExtensions (incl. .vue), babel-jest for js, and jest-transform-stub
// for assets. We only add project-specific options on top. Jest 27 resolves
// package `exports` maps natively, so the custom resolver that Vue CLI 3 / Jest
// 23 required is no longer needed.
module.exports = {
  preset: '@vue/cli-plugin-unit-jest',

  // Provide build-time VUE_APP_ env defaults before module graphs load so
  // src/config.js loadConfig() does not throw during import.
  setupFiles: ['<rootDir>/tests/setup-env.js'],

  // support the same @ -> src alias mapping used in source code
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1'
  },

  testMatch: [
    '**/tests/unit/**/*.spec.(js|jsx|ts|tsx)|**/__tests__/*.(js|jsx|ts|tsx)'
  ]
}
