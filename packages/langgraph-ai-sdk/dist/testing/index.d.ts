import { n as LanggraphData } from "../types-BEZu6l5V.js";
import * as _langchain_core_messages15 from "@langchain/core/messages";
import { BaseMessage } from "@langchain/core/messages";
import { FakeStreamingChatModel } from "@langchain/core/utils/testing";
import { z } from "zod";
import * as _langchain_langgraph14 from "@langchain/langgraph";
import { LangGraphRunnableConfig } from "@langchain/langgraph";
import * as langchain0 from "langchain";
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
declare class StructuredOutputAwareFakeModel extends FakeStreamingChatModel {
  private useStructuredOutput;
  private structuredSchema;
  private boundTools;
  private includeRaw;
  private streamingChunks;
  withStructuredOutput(schema: any, config?: any): this;
  private convertResponsesToStructuredChunks;
  bindTools(tools: any[], config?: any): any;
  _streamResponseChunks(messages: any, options?: any, runManager?: any): AsyncGenerator<any>;
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
//#region src/testing/node/types.d.ts
type NodeFunction<TState extends Record<string, unknown>> = (state: TState, config: LangGraphRunnableConfig) => Promise<Partial<TState>> | Partial<TState>;
type MiddlewareConfigType = Record<string, unknown>;
interface NodeMiddlewareType<TConfig extends MiddlewareConfigType> {
  <TState extends Record<string, unknown>>(node: NodeFunction<TState>, options: TConfig): NodeFunction<TState>;
  _config?: TConfig;
}
//#endregion
//#region src/testing/node/withContext.d.ts
interface NodeContext {
  name: string;
  graphName?: string;
}
declare function getNodeContext(): NodeContext | undefined;
type WithContextConfig = {};
/**
 * Wraps a node function with context that includes node name and graph name
 * The graph name is automatically extracted from config.configurable (thread_id or checkpoint_ns)
 */
declare const withContext: <TState extends Record<string, unknown>>(nodeFunction: NodeFunction<TState>, options: WithContextConfig) => NodeFunction<TState>;
//#endregion
//#region src/testing/node/withErrorHandling.d.ts
type ReportingFn = (error: Error) => void;
declare class Reporters {
  reporters: ReportingFn[];
  addReporter(reporter: ReportingFn | string): this;
  list(): ReportingFn[];
  report(error: Error): void;
}
declare const ErrorReporters: Reporters;
type WithErrorHandlingConfig = {};
/**
 * Wraps a node function with error handling
 */
declare const withErrorHandling: <TState extends Record<string, unknown>>(nodeFunction: NodeFunction<TState>, options: WithErrorHandlingConfig) => NodeFunction<TState>;
//#endregion
//#region src/testing/node/withNotifications.d.ts
type NotificationConfig = {
  taskName: string | ((...args: any) => Promise<string> | string);
};
/**
 * Wraps a node function with error handling
 */
declare const withNotifications: <TState extends Record<string, unknown>>(nodeFunction: NodeFunction<TState>, options: NotificationConfig) => NodeFunction<TState>;
//#endregion
//#region src/testing/node/nodeMiddlewareFactory.d.ts
type InferMiddlewareConfig<T> = T extends ((...args: any[]) => any) ? Parameters<T>[1] : never;
type MiddlewareConfigMap<TRegistered extends string, TMiddlewares> = { [K in TRegistered]?: K extends keyof TMiddlewares ? InferMiddlewareConfig<TMiddlewares[K]> : never };
type MiddlewareConfig<TRegistered extends string, TMiddlewares> = MiddlewareConfigMap<TRegistered, TMiddlewares> & {
  only?: TRegistered[];
  except?: TRegistered[];
};
declare class NodeMiddlewareFactory<TRegistered extends string = never, TMiddlewares extends Record<string, (...args: any[]) => any> = {}> {
  private middlewares;
  constructor();
  addMiddleware<TName extends string, TMiddleware extends (...args: any[]) => any>(name: TName, middleware: TMiddleware): NodeMiddlewareFactory<TRegistered | TName, TMiddlewares & Record<TName, TMiddleware>>;
  use<TState extends Record<string, unknown>>(config: MiddlewareConfig<TRegistered, TMiddlewares> | undefined, node: NodeFunction<TState>): NodeFunction<TState>;
  private getMiddlewaresToApply;
}
//#endregion
//#region src/testing/node/nodeMiddleware.d.ts
declare const NodeMiddleware: NodeMiddlewareFactory<"context" | "notifications" | "errorHandling" | "polly", Record<"context", <TState extends Record<string, unknown>>(nodeFunction: NodeFunction<TState>, options: {}) => NodeFunction<TState>> & Record<"notifications", <TState extends Record<string, unknown>>(nodeFunction: NodeFunction<TState>, options: {
  taskName: string | ((...args: any) => Promise<string> | string);
}) => NodeFunction<TState>> & Record<"errorHandling", <TState extends Record<string, unknown>>(nodeFunction: NodeFunction<TState>, options: {}) => NodeFunction<TState>> & Record<"polly", <TState extends Record<string, unknown>>(nodeFunction: NodeFunction<TState>, options: {
  [x: string]: never;
}) => NodeFunction<TState>>>;
//#endregion
//#region src/testing/graphs/graph/types.d.ts
/**
 * Schema for structured messages with intro, examples, and conclusion
 */
declare const structuredMessageSchema: z.ZodObject<{
  type: z.ZodLiteral<"structuredMessage">;
  intro: z.ZodString;
  bulletPoints: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
  conclusion: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
  type: "structuredMessage";
  intro: string;
  conclusion?: string | undefined;
  bulletPoints?: string[] | undefined;
}, {
  type: "structuredMessage";
  intro: string;
  conclusion?: string | undefined;
  bulletPoints?: string[] | undefined;
}>;
type StructuredMessage = z.infer<typeof structuredMessageSchema>;
/**
 * Graph state annotation for the sample graph
 */
declare const SampleGraphAnnotation: _langchain_langgraph14.AnnotationRoot<{
  messages: _langchain_langgraph14.BinaryOperatorAggregate<BaseMessage<_langchain_core_messages15.MessageStructure, _langchain_core_messages15.MessageType>[], BaseMessage<_langchain_core_messages15.MessageStructure, _langchain_core_messages15.MessageType>[]>;
  projectName: _langchain_langgraph14.BinaryOperatorAggregate<string | undefined, string | undefined>;
}>;
type SampleStateType = typeof SampleGraphAnnotation.State;
/**
 * Type for LangGraph data in the sample graph
 */
type GraphLanggraphData = LanggraphData<SampleStateType, typeof structuredMessageSchema>;
//#endregion
//#region src/testing/graphs/graph/sampleGraph.d.ts
/**
 * Node that generates a project name based on the user's message
 * Only runs if projectName is not already set in state
 */
declare const nameProjectNode: NodeFunction<_langchain_langgraph14.StateType<{
  messages: _langchain_langgraph14.BinaryOperatorAggregate<langchain0.BaseMessage<_langchain_core_messages15.MessageStructure, _langchain_core_messages15.MessageType>[], langchain0.BaseMessage<_langchain_core_messages15.MessageStructure, _langchain_core_messages15.MessageType>[]>;
  projectName: _langchain_langgraph14.BinaryOperatorAggregate<string | undefined, string | undefined>;
}>>;
/**
 * Node that generates a response to the user's message
 * Uses the messageSchema to return either simple or structured messages
 * Tagged with 'notify' for streaming support
 */
declare const responseNode: NodeFunction<_langchain_langgraph14.StateType<{
  messages: _langchain_langgraph14.BinaryOperatorAggregate<langchain0.BaseMessage<_langchain_core_messages15.MessageStructure, _langchain_core_messages15.MessageType>[], langchain0.BaseMessage<_langchain_core_messages15.MessageStructure, _langchain_core_messages15.MessageType>[]>;
  projectName: _langchain_langgraph14.BinaryOperatorAggregate<string | undefined, string | undefined>;
}>>;
/**
 * Creates a compiled sample graph with the given checkpointer
 *
 * Graph flow: START → nameProjectNode → responseNode → END
 *
 * @param checkpointer - Optional checkpointer for state persistence
 * @param graphName - Name to identify the graph (default: 'sample')
 * @returns Compiled LangGraph
 */
declare function createSampleGraph(checkpointer?: any, graphName?: string): _langchain_langgraph14.CompiledStateGraph<{
  messages: langchain0.BaseMessage<_langchain_core_messages15.MessageStructure, _langchain_core_messages15.MessageType>[];
  projectName: string | undefined;
}, {
  messages?: langchain0.BaseMessage<_langchain_core_messages15.MessageStructure, _langchain_core_messages15.MessageType>[] | undefined;
  projectName?: string | undefined;
}, "__start__" | "nameProjectNode" | "responseNode", {
  messages: _langchain_langgraph14.BinaryOperatorAggregate<langchain0.BaseMessage<_langchain_core_messages15.MessageStructure, _langchain_core_messages15.MessageType>[], langchain0.BaseMessage<_langchain_core_messages15.MessageStructure, _langchain_core_messages15.MessageType>[]>;
  projectName: _langchain_langgraph14.BinaryOperatorAggregate<string | undefined, string | undefined>;
}, {
  messages: _langchain_langgraph14.BinaryOperatorAggregate<langchain0.BaseMessage<_langchain_core_messages15.MessageStructure, _langchain_core_messages15.MessageType>[], langchain0.BaseMessage<_langchain_core_messages15.MessageStructure, _langchain_core_messages15.MessageType>[]>;
  projectName: _langchain_langgraph14.BinaryOperatorAggregate<string | undefined, string | undefined>;
}, _langchain_langgraph14.StateDefinition, {
  nameProjectNode: Partial<_langchain_langgraph14.StateType<{
    messages: _langchain_langgraph14.BinaryOperatorAggregate<langchain0.BaseMessage<_langchain_core_messages15.MessageStructure, _langchain_core_messages15.MessageType>[], langchain0.BaseMessage<_langchain_core_messages15.MessageStructure, _langchain_core_messages15.MessageType>[]>;
    projectName: _langchain_langgraph14.BinaryOperatorAggregate<string | undefined, string | undefined>;
  }>>;
  responseNode: Partial<_langchain_langgraph14.StateType<{
    messages: _langchain_langgraph14.BinaryOperatorAggregate<langchain0.BaseMessage<_langchain_core_messages15.MessageStructure, _langchain_core_messages15.MessageType>[], langchain0.BaseMessage<_langchain_core_messages15.MessageStructure, _langchain_core_messages15.MessageType>[]>;
    projectName: _langchain_langgraph14.BinaryOperatorAggregate<string | undefined, string | undefined>;
  }>>;
}, unknown, unknown>;
//#endregion
//#region src/testing/graphs/agent/types.d.ts
/**
 * Schema for structured questions with intro, examples, and conclusion
 */
declare const questionSchema: z.ZodObject<{
  type: z.ZodLiteral<"question">;
  text: z.ZodString;
  examples: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
  conclusion: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
  type: "question";
  text: string;
  examples?: string[] | undefined;
  conclusion?: string | undefined;
}, {
  type: "question";
  text: string;
  examples?: string[] | undefined;
  conclusion?: string | undefined;
}>;
type Question = z.infer<typeof questionSchema>;
/**
 * Schema for marketing template output
 * Generated when the agent has enough context to create landing page copy
 */
declare const marketingTemplateSchema: z.ZodObject<{
  type: z.ZodLiteral<"marketingTemplate">;
  headline: z.ZodString;
  subheadline: z.ZodOptional<z.ZodString>;
  valueProposition: z.ZodString;
  bulletPoints: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
  callToAction: z.ZodString;
  tone: z.ZodEnum<["professional", "friendly", "urgent", "authoritative", "playful"]>;
  socialProofSnippet: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
  type: "marketingTemplate";
  headline: string;
  valueProposition: string;
  callToAction: string;
  tone: "professional" | "friendly" | "urgent" | "authoritative" | "playful";
  subheadline?: string | undefined;
  bulletPoints?: string[] | undefined;
  socialProofSnippet?: string | undefined;
}, {
  type: "marketingTemplate";
  headline: string;
  valueProposition: string;
  callToAction: string;
  tone: "professional" | "friendly" | "urgent" | "authoritative" | "playful";
  subheadline?: string | undefined;
  bulletPoints?: string[] | undefined;
  socialProofSnippet?: string | undefined;
}>;
type MarketingTemplate = z.infer<typeof marketingTemplateSchema>;
/**
 * Union schema for all agent outputs
 */
declare const agentOutputSchema: readonly [z.ZodObject<{
  type: z.ZodLiteral<"question">;
  text: z.ZodString;
  examples: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
  conclusion: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
  type: "question";
  text: string;
  examples?: string[] | undefined;
  conclusion?: string | undefined;
}, {
  type: "question";
  text: string;
  examples?: string[] | undefined;
  conclusion?: string | undefined;
}>, z.ZodObject<{
  type: z.ZodLiteral<"marketingTemplate">;
  headline: z.ZodString;
  subheadline: z.ZodOptional<z.ZodString>;
  valueProposition: z.ZodString;
  bulletPoints: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
  callToAction: z.ZodString;
  tone: z.ZodEnum<["professional", "friendly", "urgent", "authoritative", "playful"]>;
  socialProofSnippet: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
  type: "marketingTemplate";
  headline: string;
  valueProposition: string;
  callToAction: string;
  tone: "professional" | "friendly" | "urgent" | "authoritative" | "playful";
  subheadline?: string | undefined;
  bulletPoints?: string[] | undefined;
  socialProofSnippet?: string | undefined;
}, {
  type: "marketingTemplate";
  headline: string;
  valueProposition: string;
  callToAction: string;
  tone: "professional" | "friendly" | "urgent" | "authoritative" | "playful";
  subheadline?: string | undefined;
  bulletPoints?: string[] | undefined;
  socialProofSnippet?: string | undefined;
}>];
type AgentOutputType = z.infer<typeof questionSchema> | z.infer<typeof marketingTemplateSchema>;
/**
 * Brainstorm topics
 */
declare const brainstormTopics: readonly ["idea", "audience", "solution", "socialProof", "lookAndFeel"];
type BrainstormTopic = typeof brainstormTopics[number];
type Brainstorm = Partial<Record<BrainstormTopic, string>>;
/**
 * User context for personalized responses
 */
type UserContext = {
  businessType?: 'B2B' | 'B2C' | 'SaaS' | 'Ecommerce' | 'Other';
  urgencyLevel?: 'low' | 'medium' | 'high';
  experienceLevel?: 'beginner' | 'intermediate' | 'expert';
};
/**
 * State annotation for the brainstorm agent
 */
declare const BrainstormStateAnnotation: _langchain_langgraph14.AnnotationRoot<{
  messages: _langchain_langgraph14.BinaryOperatorAggregate<BaseMessage<_langchain_core_messages15.MessageStructure, _langchain_core_messages15.MessageType>[], BaseMessage<_langchain_core_messages15.MessageStructure, _langchain_core_messages15.MessageType>[]>;
  brainstorm: _langchain_langgraph14.BinaryOperatorAggregate<Partial<Record<"idea" | "audience" | "solution" | "socialProof" | "lookAndFeel", string>>, Partial<Record<"idea" | "audience" | "solution" | "socialProof" | "lookAndFeel", string>>>;
  remainingTopics: _langchain_langgraph14.BinaryOperatorAggregate<("idea" | "audience" | "solution" | "socialProof" | "lookAndFeel")[], ("idea" | "audience" | "solution" | "socialProof" | "lookAndFeel")[]>;
  userContext: _langchain_langgraph14.BinaryOperatorAggregate<UserContext, UserContext>;
}>;
type AgentStateType = typeof BrainstormStateAnnotation.State;
/**
 * Type definition for Agent LangGraph data
 */
type AgentLanggraphData = LanggraphData<AgentStateType, typeof agentOutputSchema>;
//#endregion
//#region src/testing/graphs/agent/sampleAgent.d.ts
type BrainstormGraphState = {
  messages: BaseMessage[];
  brainstorm: Brainstorm;
  remainingTopics: BrainstormTopic[];
  userContext: UserContext;
};
/**
 * Node that asks a question to the user during brainstorming mode
 */
declare const brainstormAgent: (state: BrainstormGraphState, config?: LangGraphRunnableConfig) => Promise<Partial<BrainstormGraphState>>;
/**
 * Simple test graph for the new brainstorm agent
 * Usage: Load this in LangGraph Studio to test the agent
 */
declare function createSampleAgent(checkpointer?: any, graphName?: string): _langchain_langgraph14.CompiledStateGraph<{
  messages: BaseMessage<_langchain_core_messages15.MessageStructure, _langchain_core_messages15.MessageType>[];
  brainstorm: Partial<Record<"idea" | "audience" | "solution" | "socialProof" | "lookAndFeel", string>>;
  remainingTopics: ("idea" | "audience" | "solution" | "socialProof" | "lookAndFeel")[];
  userContext: UserContext;
}, {
  messages?: BaseMessage<_langchain_core_messages15.MessageStructure, _langchain_core_messages15.MessageType>[] | undefined;
  brainstorm?: Partial<Record<"idea" | "audience" | "solution" | "socialProof" | "lookAndFeel", string>> | undefined;
  remainingTopics?: ("idea" | "audience" | "solution" | "socialProof" | "lookAndFeel")[] | undefined;
  userContext?: UserContext | undefined;
}, "__start__" | "agent", {
  messages: _langchain_langgraph14.BinaryOperatorAggregate<BaseMessage<_langchain_core_messages15.MessageStructure, _langchain_core_messages15.MessageType>[], BaseMessage<_langchain_core_messages15.MessageStructure, _langchain_core_messages15.MessageType>[]>;
  brainstorm: _langchain_langgraph14.BinaryOperatorAggregate<Partial<Record<"idea" | "audience" | "solution" | "socialProof" | "lookAndFeel", string>>, Partial<Record<"idea" | "audience" | "solution" | "socialProof" | "lookAndFeel", string>>>;
  remainingTopics: _langchain_langgraph14.BinaryOperatorAggregate<("idea" | "audience" | "solution" | "socialProof" | "lookAndFeel")[], ("idea" | "audience" | "solution" | "socialProof" | "lookAndFeel")[]>;
  userContext: _langchain_langgraph14.BinaryOperatorAggregate<UserContext, UserContext>;
}, {
  messages: _langchain_langgraph14.BinaryOperatorAggregate<BaseMessage<_langchain_core_messages15.MessageStructure, _langchain_core_messages15.MessageType>[], BaseMessage<_langchain_core_messages15.MessageStructure, _langchain_core_messages15.MessageType>[]>;
  brainstorm: _langchain_langgraph14.BinaryOperatorAggregate<Partial<Record<"idea" | "audience" | "solution" | "socialProof" | "lookAndFeel", string>>, Partial<Record<"idea" | "audience" | "solution" | "socialProof" | "lookAndFeel", string>>>;
  remainingTopics: _langchain_langgraph14.BinaryOperatorAggregate<("idea" | "audience" | "solution" | "socialProof" | "lookAndFeel")[], ("idea" | "audience" | "solution" | "socialProof" | "lookAndFeel")[]>;
  userContext: _langchain_langgraph14.BinaryOperatorAggregate<UserContext, UserContext>;
}, _langchain_langgraph14.StateDefinition, {
  agent: Partial<BrainstormGraphState>;
}, unknown, unknown>;
//#endregion
export { AgentLanggraphData, AgentOutputType, AgentStateType, Brainstorm, BrainstormStateAnnotation, BrainstormTopic, ErrorReporters, GraphLanggraphData, type LLMAppConfig, type LLMConfig, type LLMCost, type LLMProvider, type LLMSkill, type LLMSpeed, MarketingTemplate, MiddlewareConfigType, type MockResponses, NodeContext, NodeFunction, NodeMiddleware, NodeMiddlewareFactory, NodeMiddlewareType, Question, SampleGraphAnnotation, SampleStateType, StructuredMessage, UserContext, agentOutputSchema, brainstormAgent, brainstormTopics, configureResponses, configureResponses$1 as configureTestResponses, coreLLMConfig, createSampleAgent, createSampleGraph, getCoreLLM, getLLM, getNodeContext, getTestLLM, hasConfiguredResponses, marketingTemplateSchema, nameProjectNode, questionSchema, resetLLMConfig, resetLLMConfig$1 as resetTestConfig, responseNode, structuredMessageSchema, withContext, withErrorHandling, withNotifications };