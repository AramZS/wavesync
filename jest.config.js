module.exports = {
  // Provide build-time VUE_APP_ env defaults before module graphs load so
  // src/config.js loadConfig() does not throw during import.
  setupFiles: ['<rootDir>/tests/setup-env.js'],
  // jsdom gives us browser-like globals (sessionStorage, document.cookie,
  // crypto, fetch) that the PKCE/token/sync code needs to be able to mock.
  testEnvironment: 'jsdom',
  moduleFileExtensions: [
    'js',
    'jsx',
    'json',
    // tell Jest to handle *.vue files
    'vue'
  ],
  transform: {
    // process *.vue files with vue-jest
    '^.+\\.vue$': 'vue-jest',
    '.+\\.(css|styl|less|sass|scss|svg|png|jpg|ttf|woff|woff2)$': 'jest-transform-stub',
    '^.+\\.jsx?$': 'babel-jest'
  },
  transformIgnorePatterns: ['/node_modules/'],
  // support the same @ -> src alias mapping in source code
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1'
  },
  // This bundled Jest (v23) predates Node's package `exports` field, so it
  // can't resolve dependencies that only expose their entry points through an
  // exports map (fast-check v4 and its pure-rand dependency). The custom
  // resolver below applies the `require`/`node` export conditions so those
  // packages load from their CommonJS builds.
  resolver: '<rootDir>/tests/jest-resolver.js',
  // serializer for snapshots
  snapshotSerializers: ['jest-serializer-vue'],
  testMatch: [
    '**/tests/unit/**/*.spec.(js|jsx|ts|tsx)|**/__tests__/*.(js|jsx|ts|tsx)'
  ],
  // https://github.com/facebook/jest/issues/6766
  testURL: 'http://localhost/',
  watchPlugins: [
    'jest-watch-typeahead/filename',
    'jest-watch-typeahead/testname'
  ]
}
