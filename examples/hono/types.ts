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
  type GraphLanggraphData as MyLanggraphData,
  type GraphLanggraphData,
} from 'langgraph-ai-sdk/testing';

/**
 * Re-export types from the agent graph
 */
export {
  questionSchema,
  finishBrainstormingSchema,
  agentOutputSchema,
  BrainstormStateAnnotation as AgentStateAnnotation,
  type Question,
  type FinishBrainstorming,
  type AgentOutputType,
  type AgentStateType,
  type AgentLanggraphData,
} from 'langgraph-ai-sdk/testing';