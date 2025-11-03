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