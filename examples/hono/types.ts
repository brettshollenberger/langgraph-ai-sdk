import { z } from 'zod';
import { type BaseMessage } from '@langchain/core/messages';
import { type LanggraphData } from 'langgraph-ai-sdk';
import { Annotation, messagesStateReducer } from '@langchain/langgraph';

export const structuredMessageSchema = z.object({
  type: z.literal('structured'),
  intro: z.string().describe('Introduction to the response'),
  examples: z.array(z.string()).describe('List of examples'),
  conclusion: z.string().describe('Conclusion of the response'),
}).strict();

export type StructuredMessage = z.infer<typeof structuredMessageSchema>;

export const plainMessageSchema = z.object({
  type: z.literal('plain'),
  content: z.string().describe('Content of the message'),
}).strict();

export type PlainMessage = z.infer<typeof plainMessageSchema>;

export const messageSchema = z.discriminatedUnion('type', [
  plainMessageSchema,
  structuredMessageSchema,
]);

export type Message = z.infer<typeof messageSchema>;

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

export type LanggraphChatData = LanggraphData<StateType, typeof messageSchema>;
