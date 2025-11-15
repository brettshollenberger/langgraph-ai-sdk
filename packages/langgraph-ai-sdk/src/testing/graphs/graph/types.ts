import { z } from 'zod';
import { type BaseMessage } from '@langchain/core/messages';
import { type LanggraphData } from '../../../types';
import { Annotation, messagesStateReducer } from '@langchain/langgraph';

/**
 * Schema for structured messages with intro, examples, and conclusion
 */
export const structuredMessageSchema = z.object({
  type: z.literal("structuredMessage"),
  intro: z.string().describe('Introduction to the response'),
  bulletPoints: z.array(z.string()).optional().describe('List of bullet points'),
  conclusion: z.string().optional().describe('Conclusion of the response'),
});

export type StructuredMessage = z.infer<typeof structuredMessageSchema>;

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
export type GraphLanggraphData = LanggraphData<SampleStateType, typeof structuredMessageSchema>;