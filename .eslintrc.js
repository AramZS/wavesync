module.exports = {
  root: true,
  env: {
    node: true,
    es2021: true
  },
  'extends': [
    'plugin:vue/essential',
    'eslint:recommended'
  ],
  rules: {
    'no-console': process.env.NODE_ENV === 'production' ? 'error' : 'off',
    'no-debugger': process.env.NODE_ENV === 'production' ? 'error' : 'off',
    // eslint-plugin-vue 8 enabled this stylistic rule by default. The app's
    // established single-word page/component names (Home, Visualizer, Callback,
    // Status) are intentional; the rule is not a correctness concern.
    'vue/multi-word-component-names': 'off'
  },
  parserOptions: {
    parser: '@babel/eslint-parser',
    requireConfigFile: false,
    ecmaVersion: 2021,
    sourceType: 'module'
  },
  overrides: [
    {
      files: ['**/tests/unit/**/*.spec.{j,t}s?(x)', '**/__tests__/*.{j,t}s?(x)'],
      env: {
        jest: true
      }
    }
  ]
}
