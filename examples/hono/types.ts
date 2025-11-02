import { z } from 'zod';

export const structuredMessageSchema = z.object({
  intro: z.string().describe('Introduction to the response'),
  examples: z.array(z.string()).describe('List of examples'),
  conclusion: z.string().describe('Conclusion of the response'),
});

export type StructuredMessage = z.infer<typeof structuredMessageSchema>;

export type StateType = {
  messages?: any[];
  projectName?: string;
};
