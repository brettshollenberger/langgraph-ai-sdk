import type { SimpleLanggraphUIMessage } from 'langgraph-ai-sdk-types';
import type { Simplify } from 'type-fest';

/**
 * Re-export types from the shared sample graph
 * This allows the hono example to use the same graph as tests
 */
import type { GraphLanggraphData, AgentLanggraphData } from 'langgraph-ai-sdk/testing';
export {
  structuredMessageSchema,
  SampleGraphAnnotation as GraphAnnotation,
  type StructuredMessage,
  type SampleStateType as StateType,
  type GraphLanggraphData as MyLanggraphData,
  type GraphLanggraphData,
  questionSchema,
  marketingTemplateSchema,
  agentOutputSchema,
  BrainstormStateAnnotation as AgentStateAnnotation,
  type Question,
  type MarketingTemplate,
  type AgentOutputType,
  type AgentStateType,
  type AgentLanggraphData,
  type UserContext,
} from 'langgraph-ai-sdk/testing';

/**
 * Explicit message types for better IntelliSense
 * These show the actual discriminated union instead of generic types
 */
export type GraphMessage = SimpleLanggraphUIMessage<GraphLanggraphData>;
export type AgentMessage = SimpleLanggraphUIMessage<AgentLanggraphData>;

/**
 * Union of all message types in this application
 * Hover over this to see the full discriminated union!
 */
export type AppMessage = Simplify<GraphMessage | AgentMessage>;