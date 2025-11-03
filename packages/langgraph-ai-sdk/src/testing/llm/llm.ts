import { type BaseChatModel } from "@langchain/core/language_models/chat_models";
import { type LLMSkill, type LLMSpeed, type LLMCost } from "./types";
import { getTestLLM, configureResponses as configureTestResponses, resetLLMConfig as resetTestConfig, hasConfiguredResponses } from "./test";
import { getCoreLLM } from "./core";
import { getNodeContext } from "../node/withContext";

// Environment detection
const isTestEnvironment = process.env.NODE_ENV === "test";

// Default speed from environment or fallback
const LLM_SPEED_DEFAULT: LLMSpeed = (process.env.LLM_SPEED === 'fast') ? "fast" : "slow";

// Default cost tier from environment or fallback
const LLM_COST_DEFAULT: LLMCost = (process.env.LLM_COST === 'paid') ? "paid" : "free";

const LLM_SKILL_DEFAULT: LLMSkill = 'writing';

/**
 * Get an LLM instance based on the current environment
 *
 * Behavior:
 * - In test environment (NODE_ENV=test):
 *   - If mock responses are configured for the current graph/node: Returns FakeListChatModel
 *   - If no mock responses are configured: Falls back to core LLM (real implementation)
 * - In development/production: Always returns core LLM instances (Anthropic, Ollama, etc.)
 *
 * This fallback behavior allows you to:
 * 1. Mock specific nodes in tests while using real LLMs for others
 * 2. Run tests without mocking everything upfront
 * 3. Gradually add mocks as needed
 *
 * @param llmSkill - The skill needed (planning, writing, coding, reasoning)
 * @param llmSpeed - Speed preference (fast or slow), defaults to LLM_SPEED env var
 * @returns BaseChatModel instance
 */
export function getLLM(
  llmSkill: LLMSkill = LLM_SKILL_DEFAULT,
  llmSpeed: LLMSpeed = LLM_SPEED_DEFAULT,
  llmCost: LLMCost = LLM_COST_DEFAULT
): BaseChatModel {
  const nodeContext = getNodeContext();
  const graphName = nodeContext?.graphName;
  const nodeName = nodeContext?.name!; // Langgraph sets this, so assert that we will always have it

  if (!graphName) {
    console.log(`oh noes idk what's going on!!!`)
    throw new Error("No graph name found in context, configure it with .config({name: 'my-graph-name'})");
  }

  if (isTestEnvironment && hasConfiguredResponses(graphName, nodeName)) {
    return getTestLLM(llmSkill, llmSpeed, llmCost);
  }

  return getCoreLLM(llmSkill, llmSpeed, llmCost);
}

/**
 * Configure mock responses for test environment
 * Organized by graph identifier (thread_id or checkpoint_ns) to avoid collisions
 *
 * @example
 * configureResponses({
 *   "thread-123": {
 *     nameProjectNode: ["project-paris"],
 *     responseNode: ["```json { intro: 'It just works' }```"]
 *   }
 * })
 */
export const configureResponses = configureTestResponses;

/**
 * Reset all configured mock responses
 * Use this in afterEach hooks to clean up test state
 *
 * @example
 * afterEach(() => {
 *   resetLLMConfig();
 * });
 */
export const resetLLMConfig = resetTestConfig;

// Re-export types for convenience
export type { LLMSkill, LLMSpeed, MockResponses } from "./types.js";
