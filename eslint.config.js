import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'docs'] },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // The queue deliberately carries `unknown` errors from failed jobs.
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  {
    // Build and test scripts are Node, not browser, and are plain JS.
    files: ['scripts/**/*.mjs', '*.config.{js,ts,mts}'],
    languageOptions: { globals: globals.node },
  },
);
