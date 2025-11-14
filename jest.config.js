/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  projects: [
    {
      displayName: 'workspace-mcp-server',
      testMatch: ['<rootDir>/workspace-mcp-server/src/**/*.test.ts', '<rootDir>/workspace-mcp-server/src/**/*.spec.ts'],
      transform: {
        '^.+\\.ts$': ['ts-jest', {
          tsconfig: {
            strict: false
          }
        }],
      },
      transformIgnorePatterns: [
        'node_modules/(?!(marked)/)',
      ],
      moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/workspace-mcp-server/src/$1',
        '\\.wasm$': '<rootDir>/workspace-mcp-server/src/__tests__/mocks/wasm.js',
        '^marked$': '<rootDir>/workspace-mcp-server/src/__tests__/mocks/marked.js',
        '^jsdom$': '<rootDir>/workspace-mcp-server/src/__tests__/mocks/jsdom.ts',
      },
      setupFilesAfterEnv: ['<rootDir>/workspace-mcp-server/src/__tests__/setup.ts'],
      collectCoverageFrom: [
        '<rootDir>/workspace-mcp-server/src/**/*.ts',
        '!<rootDir>/workspace-mcp-server/src/**/*.d.ts',
        '!<rootDir>/workspace-mcp-server/src/**/*.test.ts',
        '!<rootDir>/workspace-mcp-server/src/**/*.spec.ts',
        '!<rootDir>/workspace-mcp-server/src/index.ts',
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
    }
  ],
  coverageReporters: ['text', 'lcov', 'html'],
  testTimeout: 10000,
  verbose: true,
};