/**
 * LLM Module
 *
 * This module provides a unified interface for LLM interactions across different environments:
 * - Test: Uses FakeListChatModel with configurable responses, falls back to core LLMs when not mocked
 * - Development/Production: Uses real LLM providers (Anthropic, Ollama, etc.)
 *
 * ## Basic Usage
 *
 * ```typescript
 * import { getLLM } from './llm';
 *
 * // Get LLM (automatically uses test or core based on NODE_ENV):
 * const llm = getLLM("coding", "fast");
 * ```
 *
 * ## Test Usage with Mocking
 *
 * ```typescript
 * import { getLLM, configureResponses, resetLLMConfig } from './llm';
 *
 * describe("My Graph", () => {
 *   beforeEach(() => {
 *     // Configure responses by thread_id (or checkpoint_ns) and node name
 *     configureResponses({
 *       "test-thread-id": {
 *         nameProjectNode: ["project-paris"],
 *         responseNode: ["```json { intro: 'It just works' }```"]
 *       }
 *     });
 *   });
 *
 *   afterEach(() => {
 *     resetLLMConfig(); // Clean up after each test
 *   });
 *
 *   it("should work", async () => {
 *     // getLLM will use mocked responses for configured nodes
 *     // and fall back to core LLM for unconfigured nodes
 *     const llm = getLLM("coding");
 *     // ...
 *   });
 * });
 * ```
 *
 * ## Context Setup
 *
 * Make sure to wrap your nodes with `withContext`:
 *
 * ```typescript
 * import { withContext } from '../node/withContext';
 *
 * const myNode = withContext(async (state, config) => {
 *   // Your node logic
 *   // Graph name is automatically extracted from config.configurable.thread_id
 * });
 * ```
 */

// Main exports
export { getLLM, configureResponses, resetLLMConfig } from "./llm.js";

// Type exports
export type {
  LLMSkill,
  LLMSpeed,
  LLMCost,
  LLMProvider,
  LLMConfig,
  LLMAppConfig,
  MockResponses,
  AnthropicConfig,
  OpenAIConfig,
  GroqConfig,
  GoogleConfig,
  OllamaConfig,
  FakeConfig,
} from "./types.js";

// Environment-specific exports (for advanced usage)
export {
  getTestLLM,
  configureResponses as configureTestResponses,
  resetLLMConfig as resetTestConfig,
  hasConfiguredResponses
} from "./test.js";
export { getCoreLLM, coreLLMConfig } from "./core.js";
