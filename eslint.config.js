/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

const tseslint = require('@typescript-eslint/eslint-plugin');
const tsParser = require('@typescript-eslint/parser');
const licenseHeader = require('eslint-plugin-license-header');
const importPlugin = require('eslint-plugin-import');

module.exports = [
    {
        ignores: ['**/dist/', '*.js', '**/node_modules/', '**/coverage/', '!eslint.config.js', '**/docs/.vitepress/cache/'],
    },
    {
        files: ['workspace-server/src/**/*.ts'],
        ignores: ['**/*.test.ts', '**/*.spec.ts'],
        languageOptions: {
            parser: tsParser,
            parserOptions: {
                project: true,
                tsconfigRootDir: __dirname,
                ecmaVersion: 2020,
                sourceType: 'module',
            },
        },
        plugins: {
            '@typescript-eslint': tseslint,
        },
        rules: {
            ...tseslint.configs.recommended.rules,
            '@typescript-eslint/no-explicit-any': 'off',
            '@typescript-eslint/explicit-function-return-type': 'off',
            '@typescript-eslint/no-unused-vars': [
                'warn',
                {
                    argsIgnorePattern: '^_',
                    varsIgnorePattern: '^_',
                    caughtErrorsIgnorePattern: '^_',
                },
            ],
            'prefer-const': 'warn',
        },
    },
    {
        files: ['workspace-server/src/**/*.test.ts', 'workspace-server/src/**/*.spec.ts'],
        languageOptions: {
            parser: tsParser,
            parserOptions: {
                ecmaVersion: 2020,
                sourceType: 'module',
            },
        },
        plugins: {
            '@typescript-eslint': tseslint,
        },
        rules: {
            ...tseslint.configs.recommended.rules,
            '@typescript-eslint/no-explicit-any': 'off',
            '@typescript-eslint/explicit-function-return-type': 'off',
            '@typescript-eslint/no-unused-vars': [
                'warn',
                {
                    argsIgnorePattern: '^_',
                    varsIgnorePattern: '^_',
                },
            ],
            'prefer-const': 'warn',
        },
    },
    {
        files: ['./**/*.{tsx,ts,js}'],
        ignores: ['workspace-server/src/index.ts'], // Has shebang which conflicts with license header
        plugins: {
          'license-header': licenseHeader,
          import: importPlugin,
        },
        rules: {
          'license-header/header': [
            'error',
            [
              '/**',
              ' * @license',
              ' * Copyright 2025 Google LLC',
              ' * SPDX-License-Identifier: Apache-2.0',
              ' */',
            ],
          ],
          'import/enforce-node-protocol-usage': ['error', 'always'],
        },
      },
    {
        files: ['workspace-server/src/index.ts'],
        plugins: {
          import: importPlugin,
        },
        rules: {
          'import/enforce-node-protocol-usage': ['error', 'always'],
        },
      },
];