/**
 * Re-export types from the shared sample graph
 * This allows the hono example to use the same graph as tests
 */
export {
  structuredMessageSchema,
  simpleMessageSchema,
  sampleMessageSchema as messageSchema,
  SampleGraphAnnotation as GraphAnnotation,
  type StructuredMessage,
  type SimpleMessage,
  type SampleMessageType as MessageType,
  type SampleStateType as StateType,
  type SampleLanggraphData as MyLanggraphData,
} from 'langgraph-ai-sdk/testing';

/**
 * Re-export types from the agent graph
 */
export {
  agentStructuredQuestionSchema,
  agentSimpleQuestionSchema,
  agentFinishBrainstormingSchema,
  agentOutputSchema,
  BrainstormStateAnnotation as AgentStateAnnotation,
  type AgentStructuredQuestion,
  type AgentSimpleQuestion,
  type AgentFinishBrainstorming,
  type AgentOutputType,
  type AgentStateType,
  type AgentLanggraphData,
} from 'langgraph-ai-sdk/testing';