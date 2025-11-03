import { afterEach } from 'vitest';
import { resetLLMConfig } from '../testing/llm/test';

/**
 * Global test setup
 * Sets NODE_ENV=test and cleans up mock LLM responses after each test
 */

// Ensure we're in test environment
process.env.NODE_ENV = 'test';

// Clean up mock responses after each test
afterEach(() => {
  resetLLMConfig();
});
