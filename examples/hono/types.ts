import { z } from 'zod';

export const messageMetadataSchema = z.object({
  intro: z.string().describe('Introduction to the response'),
  examples: z.array(z.string()).describe('List of examples'),
  conclusion: z.string().describe('Conclusion of the response'),
});

export type MessageMetadata = z.infer<typeof messageMetadataSchema>;

export type StateType = {
  messages?: any[];
  projectName?: string;
};
