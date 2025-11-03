import { z } from "zod";
import { LangGraphRunnableConfig } from "@langchain/langgraph";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { ValueOf } from "type-fest";
import { FakeListChatModel } from "@langchain/core/utils/testing";

//#region src/testing/llm/types.d.ts
declare const LLMProviders: readonly ["anthropic", "ollama", "openai", "groq", "google", "fake"];
type LLMProvider = typeof LLMProviders[number];
declare const LLMSpeeds: readonly ["fast", "slow"];
type LLMSpeed = typeof LLMSpeeds[number];
declare const LLMCosts: readonly ["free", "paid"];
type LLMCost = typeof LLMCosts[number];
declare const LLMNames: {
  Haiku: "claude-4-5-haiku-latest";
  Sonnet: "claude-4-5-sonnet-latest";
  GptOss: "gpt-oss:20b";
  GeminiFlash: "gemini-1.5-flash-latest";
  LlamaInstant: "llama-3.1-8b-instant";
  Fake: "fake";
};
type LLMName = keyof typeof LLMNames;
type LLMModelCard = ValueOf<typeof LLMNames>;
declare const temperatureSchema: z.ZodNumber;
type Temperature = z.infer<typeof temperatureSchema>;
declare const LLMSkills: readonly ["planning", "writing", "coding", "reasoning"];
type LLMSkill = typeof LLMSkills[number];
interface LocalConfig {
  provider: LLMProvider;
  model: LLMName;
  modelCard: LLMModelCard;
  temperature: Temperature;
  tags?: string[];
  maxTokens: number;
}
interface APIConfig extends LocalConfig {
  apiKey: string;
}
type LLMConfig = APIConfig | LocalConfig;
interface LLMsConfig {
  planning: LLMConfig;
  writing: LLMConfig;
  coding: LLMConfig;
  reasoning: LLMConfig;
}
interface LLMAppConfig {
  "free": {
    "fast": LLMsConfig;
    "slow": LLMsConfig;
  };
  "paid": {
    "fast": LLMsConfig;
    "slow": LLMsConfig;
  };
}
interface MockResponses {
  [graphName: string]: {
    [nodeName: string]: string[];
  };
}
interface ILLMManager {
  get(llmSkill: LLMSkill, llmSpeed: LLMSpeed, llmCost: LLMCost): BaseChatModel;
}
//#endregion
//#region src/testing/llm/test.d.ts
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
declare function configureResponses$1(responses: MockResponses): void;
/**
 * Reset all configured responses
 * Useful in afterEach hooks to clean up test state
 *
 * @example
 * afterEach(() => {
 *   resetLLMConfig();
 * });
 */
declare function resetLLMConfig$1(): void;
/**
 * Get a test LLM instance (FakeListChatModel) based on the current node context
 * Returns null if no responses are configured for the current graph/node combination,
 * allowing the main getLLM function to fall back to core LLM
 */
declare function getTestLLM(...args: Parameters<ILLMManager['get']>): FakeListChatModel;
/**
 * Check if test responses are configured for a specific graph and node
 * Useful for conditional test logic
 */
declare function hasConfiguredResponses(graphName: string, nodeName: string): boolean;
//#endregion
//#region src/testing/llm/llm.d.ts
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
declare function getLLM(llmSkill: LLMSkill, llmSpeed?: LLMSpeed, llmCost?: LLMCost): BaseChatModel;
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
declare const configureResponses: typeof configureResponses$1;
/**
 * Reset all configured mock responses
 * Use this in afterEach hooks to clean up test state
 *
 * @example
 * afterEach(() => {
 *   resetLLMConfig();
 * });
 */
declare const resetLLMConfig: typeof resetLLMConfig$1;
//#endregion
//#region src/testing/llm/core.d.ts
declare const coreLLMConfig: LLMAppConfig;
/**
 * Get a core LLM instance based on skill and speed
 * This is used for development and production environments with real LLM providers
 */
declare function getCoreLLM(llmSkill: LLMSkill, llmSpeed: LLMSpeed, llmCost?: LLMCost): BaseChatModel;
//#endregion
//#region src/testing/node/withContext.d.ts
interface NodeContext {
  name: string;
  graphName?: string;
}
declare function getNodeContext(): NodeContext | undefined;
type NodeFunction<TState extends Record<string, unknown>> = (state: TState, config: LangGraphRunnableConfig) => Promise<TState>;
/**
 * Wraps a node function with context that includes node name and graph name
 * The graph name is automatically extracted from config.configurable (thread_id or checkpoint_ns)
 */
declare const withContext: <TState extends Record<string, unknown>>(nodeFunction: NodeFunction<TState>) => NodeFunction<TState>;
//#endregion
export { type LLMAppConfig, type LLMConfig, type LLMCost, type LLMProvider, type LLMSkill, type LLMSpeed, type MockResponses, NodeContext, configureResponses, configureResponses$1 as configureTestResponses, coreLLMConfig, getCoreLLM, getLLM, getNodeContext, getTestLLM, hasConfiguredResponses, resetLLMConfig, resetLLMConfig$1 as resetTestConfig, withContext };