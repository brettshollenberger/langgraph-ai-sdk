import { afterEach, vi } from 'vitest';

/**
 * Global test setup for React tests
 */

// Mock fetch globally
global.fetch = vi.fn();

// Clean up after each test
afterEach(() => {
  vi.clearAllMocks();
});
