import { FakeListChatModel } from "@langchain/core/utils/testing";
import { type BaseChatModel } from "@langchain/core/language_models/chat_models";
import { getNodeContext } from "../node/withContext";
import {
  type LLMAppConfig,
  type LocalConfig,
  type MockResponses,
  type ILLMManager,
  LLMNames,
} from "./types";

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

// Mock response manager - stores normalized (string) responses
class TestLLMManager implements ILLMManager {
    responses: { [graphName: string]: { [nodeName: string]: string[] } } = {};

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
 * Convert a response value to a string format suitable for FakeListChatModel
 * - Objects are converted to ```json ... ``` format
 * - Strings are returned as-is
 */
function normalizeResponse(response: string | object): string {
  if (typeof response === 'string') {
    return response;
  }

  // Convert object to JSON and wrap in markdown code block
  const jsonString = JSON.stringify(response, null, 2);
  return `\`\`\`json\n${jsonString}\n\`\`\``;
}

/**
 * Configure mock responses for specific nodes in test environment
 * Organized by graph identifier (thread_id or checkpoint_ns) to avoid collisions
 *
 * Supports both string responses and object responses:
 * - Strings are used as-is
 * - Objects are automatically converted to ```json ... ``` format
 *
 * @example
 * configureResponses({
 *   "thread-123": {
 *     nameProjectNode: ["project-paris"],
 *     // Both formats work:
 *     responseNode: [{ intro: 'It just works', examples: ['ex1'], conclusion: 'Done' }]
 *     // Or: responseNode: ["```json { \"intro\": \"It just works\" }```"]
 *   },
 *   "thread-456": {
 *     nameProjectNode: ["project-london"],
 *     responseNode: [{ intro: 'Also works' }]
 *   }
 * })
 */
export function configureResponses(responses: MockResponses) {
    // Normalize all responses to string format
    const normalizedResponses: { [graphName: string]: { [nodeName: string]: string[] } } = {};

    for (const [graphName, graphResponses] of Object.entries(responses)) {
      normalizedResponses[graphName] = {};
      for (const [nodeName, nodeResponses] of Object.entries(graphResponses)) {
        normalizedResponses[graphName][nodeName] = nodeResponses.map(normalizeResponse);
      }
    }

    manager.responses = normalizedResponses;
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
