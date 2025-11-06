import { z } from 'zod';
import { Annotation, messagesStateReducer } from '@langchain/langgraph';
import type { Message } from '@langchain/core/messages';
import type { LanggraphDataBase } from 'langgraph-ai-sdk-types';

/**
 * Schema for structured questions with intro, examples, and conclusion
 */
export const agentStructuredQuestionSchema = z.object({
  type: z.literal("structuredQuestion"),
  intro: z.string().describe('A simple intro to the question'),
  examples: z.array(z.string()).describe(`List of examples to help the user understand what we're asking`),
  conclusion: z.string().optional().describe(`Conclusion of the question, restating exactly the information we want to the user to answer`),
});

export type AgentStructuredQuestion = z.infer<typeof agentStructuredQuestionSchema>;

/**
 * Schema for simple text questions
 */
export const agentSimpleQuestionSchema = z.object({
  type: z.literal("simpleQuestion"),
  content: z.string().describe('Simple question to ask the user'),
});

export type AgentSimpleQuestion = z.infer<typeof agentSimpleQuestionSchema>;

/**
 * Schema for finishing brainstorming
 */
export const agentFinishBrainstormingSchema = z.object({
  type: z.literal("finishBrainstorming"),
  finishBrainstorming: z.literal(true).describe("Call to signal that the user has finished brainstorming"),
});

export type AgentFinishBrainstorming = z.infer<typeof agentFinishBrainstormingSchema>;

/**
 * Union schema for all agent output types
 */
export const agentOutputSchema = z.discriminatedUnion("type", [
  agentSimpleQuestionSchema,
  agentStructuredQuestionSchema,
  agentFinishBrainstormingSchema,
]);

export type AgentOutputType = z.infer<typeof agentOutputSchema>;

/**
 * Brainstorm topics
 */
export const brainstormTopics = ["idea", "audience", "solution", "socialProof", "lookAndFeel"] as const;
export type BrainstormTopic = typeof brainstormTopics[number];
export type Brainstorm = Partial<Record<BrainstormTopic, string>>;

/**
 * State annotation for the brainstorm agent
 */
export const BrainstormStateAnnotation = Annotation.Root({
  messages: Annotation<Message[]>({
    default: () => [],
    reducer: messagesStateReducer as any
  }),

  brainstorm: Annotation<Brainstorm>({
    default: () => ({}),
    reducer: (current, next) => ({ ...current, ...next })
  }),

  remainingTopics: Annotation<BrainstormTopic[]>({
    default: () => [...brainstormTopics],
    reducer: (current, next) => next
  }),
});

export type AgentStateType = typeof BrainstormStateAnnotation.State;

/**
 * Type definition for Agent LangGraph data
 */
export type AgentLanggraphData = LanggraphDataBase<
  typeof agentOutputSchema,
  typeof BrainstormStateAnnotation
>;
