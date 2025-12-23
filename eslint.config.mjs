// @ts-check

import eslint from '@eslint/js';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig(
  eslint.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ['**/*.spec.ts', 'test/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unused-expressions': 'off',
      // TODO: figure out if we can enable these (and fix offenses)
      'no-useless-escape': 'warn',
      'no-control-regex': 'warn',
    },
  },
  {
    files: ['src/Grammars/*.ts'],
    rules: {
      // TODO: figure out if we can enable these (and fix offenses)
      'no-useless-escape': 'warn',
      'no-control-regex': 'warn',
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  }
);
