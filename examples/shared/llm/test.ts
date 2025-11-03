import { FakeListChatModel } from "@langchain/core/utils/testing";
import { type BaseChatModel } from "@langchain/core/language_models/chat_models";
import { getNodeContext } from "../node/withContext.js";
import {
  type LLMAppConfig,
  type LocalConfig,
  type MockResponses,
  type ILLMManager,
  LLMNames,
} from "./types.js";

// Fake Config for testing
export const FakeConfig: LocalConfig = {
  provider: "fake",
  model: "Fake",
  modelCard: LLMNames.Fake,
  temperature: 0,
  maxTokens: 128_000,
}

// Test environment uses Fake for all skills
const testConfig = {
  planning: FakeConfig,
  writing: FakeConfig,
  coding: FakeConfig,
  reasoning: FakeConfig,
};

export const testLLMConfig: LLMAppConfig = {
  "free": {
    "fast": testConfig,
    "slow": testConfig,
  },
  "paid": {
    "fast": testConfig,
    "slow": testConfig,
  },
};

// Mock response manager
class TestLLMManager implements ILLMManager {
    responses: MockResponses = {};

    get(...args: Parameters<ILLMManager['get']>): FakeListChatModel {
      const nodeContext = getNodeContext();
      const graphName = nodeContext?.graphName;
      const nodeName = nodeContext?.name;

      if (!graphName || !nodeName) {
        throw new Error("Graph name or node name is missing! Cannot get test LLM without proper context.");
      }

      // If no responses configured for this graph/node, return null to trigger fallback
      const graphResponses = this.responses[graphName];
      if (!graphResponses || !graphResponses[nodeName]) {
        throw new Error("No responses configured for this graph/node combination.");
      }

      return new FakeListChatModel({
        responses: graphResponses[nodeName],
      });
    }
}

const manager = new TestLLMManager();

/**
 * Configure mock responses for specific nodes in test environment
 * Organized by graph identifier (thread_id or checkpoint_ns) to avoid collisions
 *
 * @example
 * configureResponses({
 *   "thread-123": {
 *     nameProjectNode: ["project-paris"],
 *     responseNode: ["```json { intro: 'It just works' }```"]
 *   },
 *   "thread-456": {
 *     nameProjectNode: ["project-london"],
 *     responseNode: ["```json { intro: 'Also works' }```"]
 *   }
 * })
 */
export function configureResponses(responses: MockResponses) {
    manager.responses = responses;
}

/**
 * Reset all configured responses
 * Useful in afterEach hooks to clean up test state
 *
 * @example
 * afterEach(() => {
 *   resetLLMConfig();
 * });
 */
export function resetLLMConfig() {
    manager.responses = {};
}

/**
 * Get a test LLM instance (FakeListChatModel) based on the current node context
 * Returns null if no responses are configured for the current graph/node combination,
 * allowing the main getLLM function to fall back to core LLM
 */
export function getTestLLM(...args: Parameters<ILLMManager['get']>): FakeListChatModel {
    return manager.get(...args);
}

/**
 * Check if test responses are configured for a specific graph and node
 * Useful for conditional test logic
 */
export function hasConfiguredResponses(graphName: string, nodeName: string): boolean {
  return !!(manager.responses[graphName]?.[ nodeName]);
}
