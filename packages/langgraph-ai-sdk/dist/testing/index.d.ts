import { r as LanggraphData } from "../types-I07lV9Sd.js";
import * as _langchain_core_messages30 from "@langchain/core/messages";
import { AIMessage, BaseMessage } from "@langchain/core/messages";
import { FakeListChatModel } from "@langchain/core/utils/testing";
import { z } from "zod";
import * as _langchain_langgraph11 from "@langchain/langgraph";
import { LangGraphRunnableConfig } from "@langchain/langgraph";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { ValueOf } from "type-fest";

//#region src/testing/llm/types.d.ts
declare const LLMProviders: readonly ["anthropic", "ollama", "openai", "groq", "google", "fake"];
type LLMProvider = typeof LLMProviders[number];
declare const LLMSpeeds: readonly ["fast", "slow"];
type LLMSpeed = typeof LLMSpeeds[number];
declare const LLMCosts: readonly ["free", "paid"];
type LLMCost = typeof LLMCosts[number];
declare const LLMNames: {
  Haiku: "claude-haiku-4-5";
  Sonnet: "claude-sonnet-4-5";
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
    [nodeName: string]: (string | object)[];
  };
}
interface ILLMManager {
  get(llmSkill: LLMSkill, llmSpeed: LLMSpeed, llmCost: LLMCost): BaseChatModel;
}
//#endregion
//#region src/testing/llm/test.d.ts
declare class StructuredOutputAwareFakeModel extends FakeListChatModel {
  private useStructuredOutput;
  withStructuredOutput(schema: any, config?: any): this;
  invoke(input: any, options?: any): Promise<any>;
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
 * Get a test LLM instance (StructuredOutputAwareFakeModel) based on the current node context
 * Returns null if no responses are configured for the current graph/node combination,
 * allowing the main getLLM function to fall back to core LLM
 */
declare function getTestLLM(...args: Parameters<ILLMManager['get']>): StructuredOutputAwareFakeModel;
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
declare function getLLM(llmSkill?: LLMSkill, llmSpeed?: LLMSpeed, llmCost?: LLMCost): BaseChatModel;
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
type NodeFunction<TState extends Record<string, unknown>> = (state: TState, config: LangGraphRunnableConfig) => Promise<Partial<TState>>;
/**
 * Wraps a node function with context that includes node name and graph name
 * The graph name is automatically extracted from config.configurable (thread_id or checkpoint_ns)
 */
declare const withContext: <TState extends Record<string, unknown>>(nodeFunction: NodeFunction<TState>) => NodeFunction<TState>;
//#endregion
//#region src/testing/graphs/types.d.ts
/**
 * Schema for structured messages with intro, examples, and conclusion
 */
declare const structuredMessageSchema: z.ZodObject<{
  intro: z.ZodString;
  examples: z.ZodArray<z.ZodString, "many">;
  conclusion: z.ZodString;
}, "strip", z.ZodTypeAny, {
  intro: string;
  examples: string[];
  conclusion: string;
}, {
  intro: string;
  examples: string[];
  conclusion: string;
}>;
type StructuredMessage = z.infer<typeof structuredMessageSchema>;
/**
 * Schema for simple text messages
 */
declare const simpleMessageSchema: z.ZodObject<{
  content: z.ZodString;
}, "strip", z.ZodTypeAny, {
  content: string;
}, {
  content: string;
}>;
type SimpleMessage = z.infer<typeof simpleMessageSchema>;
/**
 * Union schema allowing either simple or structured messages
 */
declare const sampleMessageSchema: z.ZodUnion<[z.ZodObject<{
  content: z.ZodString;
}, "strip", z.ZodTypeAny, {
  content: string;
}, {
  content: string;
}>, z.ZodObject<{
  intro: z.ZodString;
  examples: z.ZodArray<z.ZodString, "many">;
  conclusion: z.ZodString;
}, "strip", z.ZodTypeAny, {
  intro: string;
  examples: string[];
  conclusion: string;
}, {
  intro: string;
  examples: string[];
  conclusion: string;
}>]>;
type SampleMessageType = z.infer<typeof sampleMessageSchema>;
/**
 * Graph state annotation for the sample graph
 */
declare const SampleGraphAnnotation: _langchain_langgraph11.AnnotationRoot<{
  messages: _langchain_langgraph11.BinaryOperatorAggregate<BaseMessage<_langchain_core_messages30.MessageStructure, _langchain_core_messages30.MessageType>[], BaseMessage<_langchain_core_messages30.MessageStructure, _langchain_core_messages30.MessageType>[]>;
  projectName: _langchain_langgraph11.BinaryOperatorAggregate<string | undefined, string | undefined>;
}>;
type SampleStateType = typeof SampleGraphAnnotation.State;
/**
 * Type for LangGraph data in the sample graph
 */
type SampleLanggraphData = LanggraphData<SampleStateType, typeof sampleMessageSchema>;
//#endregion
//#region src/testing/graphs/sampleGraph.d.ts
/**
 * Node that generates a project name based on the user's message
 * Only runs if projectName is not already set in state
 */
declare const nameProjectNode: (state: SampleStateType, config: LangGraphRunnableConfig) => Promise<{
  projectName?: undefined;
} | {
  projectName: any;
}>;
/**
 * Node that generates a response to the user's message
 * Uses the messageSchema to return either simple or structured messages
 * Tagged with 'notify' for streaming support
 */
declare const responseNode: (state: SampleStateType, config: LangGraphRunnableConfig) => Promise<{
  messages: AIMessage<_langchain_core_messages30.MessageStructure>[];
}>;
/**
 * Creates a compiled sample graph with the given checkpointer
 *
 * Graph flow: START → nameProjectNode → responseNode → END
 *
 * @param checkpointer - Optional checkpointer for state persistence
 * @param graphName - Name to identify the graph (default: 'sample')
 * @returns Compiled LangGraph
 */
declare function createSampleGraph(checkpointer?: any, graphName?: string): _langchain_langgraph11.CompiledStateGraph<{
  messages: _langchain_core_messages30.BaseMessage<_langchain_core_messages30.MessageStructure, _langchain_core_messages30.MessageType>[];
  projectName: string | undefined;
}, {
  messages?: _langchain_core_messages30.BaseMessage<_langchain_core_messages30.MessageStructure, _langchain_core_messages30.MessageType>[] | undefined;
  projectName?: string | undefined;
}, "__start__" | "nameProjectNode" | "responseNode", {
  messages: _langchain_langgraph11.BinaryOperatorAggregate<_langchain_core_messages30.BaseMessage<_langchain_core_messages30.MessageStructure, _langchain_core_messages30.MessageType>[], _langchain_core_messages30.BaseMessage<_langchain_core_messages30.MessageStructure, _langchain_core_messages30.MessageType>[]>;
  projectName: _langchain_langgraph11.BinaryOperatorAggregate<string | undefined, string | undefined>;
}, {
  messages: _langchain_langgraph11.BinaryOperatorAggregate<_langchain_core_messages30.BaseMessage<_langchain_core_messages30.MessageStructure, _langchain_core_messages30.MessageType>[], _langchain_core_messages30.BaseMessage<_langchain_core_messages30.MessageStructure, _langchain_core_messages30.MessageType>[]>;
  projectName: _langchain_langgraph11.BinaryOperatorAggregate<string | undefined, string | undefined>;
}, _langchain_langgraph11.StateDefinition, {
  nameProjectNode: Partial<_langchain_langgraph11.StateType<{
    messages: _langchain_langgraph11.BinaryOperatorAggregate<_langchain_core_messages30.BaseMessage<_langchain_core_messages30.MessageStructure, _langchain_core_messages30.MessageType>[], _langchain_core_messages30.BaseMessage<_langchain_core_messages30.MessageStructure, _langchain_core_messages30.MessageType>[]>;
    projectName: _langchain_langgraph11.BinaryOperatorAggregate<string | undefined, string | undefined>;
  }>>;
  responseNode: Partial<_langchain_langgraph11.StateType<{
    messages: _langchain_langgraph11.BinaryOperatorAggregate<_langchain_core_messages30.BaseMessage<_langchain_core_messages30.MessageStructure, _langchain_core_messages30.MessageType>[], _langchain_core_messages30.BaseMessage<_langchain_core_messages30.MessageStructure, _langchain_core_messages30.MessageType>[]>;
    projectName: _langchain_langgraph11.BinaryOperatorAggregate<string | undefined, string | undefined>;
  }>>;
}, unknown, unknown>;
//#endregion
export { type LLMAppConfig, type LLMConfig, type LLMCost, type LLMProvider, type LLMSkill, type LLMSpeed, type MockResponses, NodeContext, SampleGraphAnnotation, SampleLanggraphData, SampleMessageType, SampleStateType, SimpleMessage, StructuredMessage, configureResponses, configureResponses$1 as configureTestResponses, coreLLMConfig, createSampleGraph, getCoreLLM, getLLM, getNodeContext, getTestLLM, hasConfiguredResponses, nameProjectNode, resetLLMConfig, resetLLMConfig$1 as resetTestConfig, responseNode, sampleMessageSchema, simpleMessageSchema, structuredMessageSchema, withContext };