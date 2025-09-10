import eslint from '@eslint/js';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import nPlugin from 'eslint-plugin-n';
import prettierPluginRecommended from 'eslint-plugin-prettier/recommended';
import unusedImports from 'eslint-plugin-unused-imports';

export default defineConfig(
  eslint.configs.recommended,
  tseslint.configs.recommended,
  prettierPluginRecommended,
  {
    plugins: {
      n: nPlugin,
      'unused-imports': unusedImports,
    },
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.node,
      }
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      'n/prefer-node-protocol': 'warn',
      'unused-imports/no-unused-imports': 'error',
      'unused-imports/no-unused-vars': [
        'warn',
        {
          'vars': 'all',
          'varsIgnorePattern': '^_',
          'args': 'after-used',
          'argsIgnorePattern': '^_',
        },
      ]
    } 
  },
  {
    files: ['test/**/*.ts'], 
    rules: {
      '@typescript-eslint/no-unused-vars': 'off',
    }
  }
);
