import { z } from 'zod';
import { type BaseMessage } from '@langchain/core/messages';
import { type LanggraphData } from '../../types';
import { Annotation, messagesStateReducer } from '@langchain/langgraph';

/**
 * Schema for structured messages with intro, examples, and conclusion
 */
export const structuredMessageSchema = z.object({
  intro: z.string().describe('Introduction to the response'),
  examples: z.array(z.string()).describe('List of examples'),
  conclusion: z.string().describe('Conclusion of the response'),
});

export type StructuredMessage = z.infer<typeof structuredMessageSchema>;

/**
 * Schema for simple text messages
 */
export const simpleMessageSchema = z.object({
  content: z.string().describe('Content of the message'),
});

export type SimpleMessage = z.infer<typeof simpleMessageSchema>;

/**
 * Union schema allowing either simple or structured messages
 */
export const sampleMessageSchema = z.union([
  simpleMessageSchema,
  structuredMessageSchema,
]);

export type SampleMessageType = z.infer<typeof sampleMessageSchema>;

/**
 * Graph state annotation for the sample graph
 */
export const SampleGraphAnnotation = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    default: () => [],
    reducer: messagesStateReducer,
  }),
  projectName: Annotation<string | undefined>({
    default: () => undefined,
    reducer: (curr, next) => next ?? curr,
  }),
});

export type SampleStateType = typeof SampleGraphAnnotation.State;

/**
 * Type for LangGraph data in the sample graph
 */
export type SampleLanggraphData = LanggraphData<SampleStateType, typeof sampleMessageSchema>;
