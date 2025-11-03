import { z } from 'zod';
import { type LanggraphData } from 'langgraph-ai-sdk';

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

export type StateType = {
  messages: any[];
  projectName?: string;
};

export type LanggraphChatData = LanggraphData<StateType, typeof messageSchema>;
