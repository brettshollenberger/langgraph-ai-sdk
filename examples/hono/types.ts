import { z } from 'zod';
import { type BaseMessage } from '@langchain/core/messages';
import { type LanggraphData } from 'langgraph-ai-sdk';
import { Annotation, messagesStateReducer } from '@langchain/langgraph';

export const structuredMessageSchema = z.object({
  intro: z.string().describe('Introduction to the response'),
  examples: z.array(z.string()).describe('List of examples'),
  conclusion: z.string().describe('Conclusion of the response'),
});

export type StructuredMessage = z.infer<typeof structuredMessageSchema>;

export const GraphAnnotation = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    default: () => [],
    reducer: messagesStateReducer,
  }),
  projectName: Annotation<string | undefined>({
    default: () => undefined,
    reducer: (curr, next) => next ?? curr,
  }),
});

export type StateType = typeof GraphAnnotation.State;

export type MyLanggraphData = LanggraphData<StateType, typeof structuredMessageSchema>;
