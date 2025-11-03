import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'testing/index': 'src/testing/index.ts'
  },
  format: ['esm'],
  dts: true,
  external: [
    /^@langchain\//,
    /^@langgraph-ai-sdk\//,
    'type-fest',
    'zod',
    'uuid',
    'drizzle-orm',
    'pg',
    'ai',
    'langchain'
  ],
});
