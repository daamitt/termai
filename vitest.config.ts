import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Test environment
    environment: 'node',

    // Global test timeout (E2E tests need more time)
    testTimeout: 30000,

    // Hook timeouts
    hookTimeout: 30000,

    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json', 'lcov'],
      reportsDirectory: './coverage',

      // Files to include in coverage
      include: ['src/**/*.ts'],

      // Files to exclude from coverage
      exclude: [
        'src/test/**',
        'src/**/*.test.ts',
        'src/**/*.spec.ts',
        'dist/**',
        'node_modules/**',
        '**/*.d.ts',
      ],

      // Coverage thresholds (adjust as needed)
      thresholds: {
        lines: 60,
        functions: 60,
        branches: 60,
        statements: 60,
      },
    },

    // Only run test files matching these patterns
    include: ['src/**/*.{test,spec}.ts'],

    // Exclude patterns
    exclude: ['node_modules', 'dist'],

    // Reporter configuration
    reporters: ['verbose'],

    // Sequence configuration for E2E tests
    sequence: {
      concurrent: false, // Run E2E tests sequentially
    },
  },
});
