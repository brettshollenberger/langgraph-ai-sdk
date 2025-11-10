import { z } from 'zod';
import { Annotation, messagesStateReducer } from '@langchain/langgraph';
import type { BaseMessage } from '@langchain/core/messages';
import type { LanggraphData } from '../../types';

/**
 * Schema for structured questions with intro, examples, and conclusion
 */
export const questionSchema = z.object({
  text: z.string().describe('A simple intro to the question'),
  examples: z.array(z.string()).optional().describe(`OPTIONAL: List of examples to help the user understand what we're asking.`),
  conclusion: z.string().optional().describe(`OPTIONAL: Conclusion text to include after examples`),
});

export type Question = z.infer<typeof questionSchema>;

/**
 * Schema for finishing brainstorming
 */
export const finishBrainstormingSchema = z.object({
  type: z.literal("finishBrainstorming"),
  finishBrainstorming: z.literal(true).describe("Call to signal that the user has finished brainstorming"),
});

export type FinishBrainstorming = z.infer<typeof finishBrainstormingSchema>;
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
  messages: Annotation<BaseMessage[]>({
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
export type AgentLanggraphData = LanggraphData<
  AgentStateType,
  typeof questionSchema
>;
