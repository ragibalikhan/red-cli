export default [
  {
    ignores: [
      'node_modules/**',
      'coverage/**',
      'dist/**',
      'build/**'
    ]
  },
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        AbortController: 'readonly',
        Buffer: 'readonly',
        clearTimeout: 'readonly',
        console: 'readonly',
        fetch: 'readonly',
        global: 'readonly',
        process: 'readonly',
        setTimeout: 'readonly',
        TextDecoder: 'readonly',
        URL: 'readonly'
      }
    },
    rules: {}
  }
];
