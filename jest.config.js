/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  projects: [
    {
      displayName: 'workspace-server',
      testMatch: [
        '<rootDir>/workspace-server/src/**/*.test.ts',
        '<rootDir>/workspace-server/src/**/*.spec.ts',
      ],
      transform: {
        '^.+\\.ts$': [
          'ts-jest',
          {
            tsconfig: {
              strict: false,
              types: ['jest', 'node'],
              // Match the production build (module: commonjs, node10) so the
              // exports-map "import" condition is ignored. Without this,
              // ts-jest >= 29.4.10 resolves gaxios's ESM type declarations for
              // bare imports while googleapis-common resolves the CJS ones,
              // producing spurious GaxiosOptions/GaxiosError type clashes.
              module: 'commonjs',
              moduleResolution: 'node10',
            },
          },
        ],
      },
      transformIgnorePatterns: ['node_modules/'],
      moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/workspace-server/src/$1',
        '\\.wasm$': '<rootDir>/workspace-server/src/__tests__/mocks/wasm.js',
      },
      roots: ['<rootDir>/workspace-server/src'],
      setupFilesAfterEnv: ['<rootDir>/workspace-server/src/__tests__/setup.ts'],
      collectCoverageFrom: [
        '<rootDir>/workspace-server/src/**/*.ts',
        '!<rootDir>/workspace-server/src/**/*.d.ts',
        '!<rootDir>/workspace-server/src/**/*.test.ts',
        '!<rootDir>/workspace-server/src/**/*.spec.ts',
        '!<rootDir>/workspace-server/src/index.ts',
      ],
      coverageDirectory: '<rootDir>/coverage',
      coverageThreshold: {
        global: {
          branches: 45,
          functions: 65,
          lines: 60,
          statements: 60,
        },
      },
    },
  ],
  coverageReporters: ['text', 'lcov', 'html'],
  testTimeout: 10000,
  verbose: true,
};
