import { z } from 'zod';
import { type BaseMessage } from '@langchain/core/messages';
import { type LanggraphData } from 'langgraph-ai-sdk';

export const structuredMessageSchema = z.object({
  intro: z.string().describe('Introduction to the response'),
  examples: z.array(z.string()).describe('List of examples'),
  conclusion: z.string().describe('Conclusion of the response'),
});

export type StructuredMessage = z.infer<typeof structuredMessageSchema>;

export type StateType = {
  messages: BaseMessage[];
  projectName?: string;
};

export type MyLanggraphData = LanggraphData<StateType, typeof structuredMessageSchema>;
