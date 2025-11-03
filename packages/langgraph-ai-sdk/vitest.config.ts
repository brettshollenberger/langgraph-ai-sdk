import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./src/__tests__/setup.ts'],
    env: {
      NODE_ENV: 'test',
    },
    include: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
  },
  resolve: {
    alias: {
      'langgraph-ai-sdk': path.resolve(__dirname, './src/index.ts'),
      'langgraph-ai-sdk/testing': path.resolve(__dirname, './src/testing/index.ts'),
    },
  },
});
