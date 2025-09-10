import eslint from '@eslint/js';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default defineConfig(
  eslint.configs.recommended,
  tseslint.configs.recommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
      }
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
    } 
  },
  {
    files: ["test/**/*.ts"], 
    rules: {
      "@typescript-eslint/no-unused-vars": "off",
    }
  }
);
