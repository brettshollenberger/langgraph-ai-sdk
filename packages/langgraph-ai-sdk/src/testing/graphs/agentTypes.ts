import { z } from 'zod';
import { Annotation, messagesStateReducer } from '@langchain/langgraph';
import type { BaseMessage } from '@langchain/core/messages';
import type { LanggraphData } from '../../types';

/**
 * Schema for structured questions with intro, examples, and conclusion
 */
export const questionSchema = z.object({
  type: z.literal("question"),
  text: z.string().describe('A simple intro to the question'),
  examples: z.array(z.string()).optional().describe(`OPTIONAL: List of examples to help the user understand what we're asking.`),
  conclusion: z.string().optional().describe(`OPTIONAL: Conclusion text to include after examples`),
});

export type Question = z.infer<typeof questionSchema>;

/**
 * Schema for marketing template output
 * Generated when the agent has enough context to create landing page copy
 */
export const marketingTemplateSchema = z.object({
  type: z.literal("marketingTemplate"),
  headline: z.string().describe("Compelling headline that grabs attention"),
  subheadline: z.string().optional().describe("Supporting subheadline that expands on the main headline"),
  valueProposition: z.string().describe("Clear statement of what makes this business unique"),
  bulletPoints: z.array(z.string()).optional().describe("3-5 key benefits or features to highlight"),
  callToAction: z.string().describe("Strong call-to-action text"),
  tone: z.enum(["professional", "friendly", "urgent", "authoritative", "playful"]).describe("The tone of the copy"),
  socialProofSnippet: z.string().optional().describe("Brief social proof or testimonial snippet"),
});

export type MarketingTemplate = z.infer<typeof marketingTemplateSchema>;

/**
 * Union schema for all agent outputs
 */
export const agentOutputSchema = [questionSchema, marketingTemplateSchema] as const;
export type AgentOutputType = z.infer<typeof questionSchema> | z.infer<typeof marketingTemplateSchema>;

/**
 * Brainstorm topics
 */
export const brainstormTopics = ["idea", "audience", "solution", "socialProof", "lookAndFeel"] as const;
export type BrainstormTopic = typeof brainstormTopics[number];
export type Brainstorm = Partial<Record<BrainstormTopic, string>>;

/**
 * User context for personalized responses
 */
export type UserContext = {
  businessType?: 'B2B' | 'B2C' | 'SaaS' | 'Ecommerce' | 'Other';
  urgencyLevel?: 'low' | 'medium' | 'high';
  experienceLevel?: 'beginner' | 'intermediate' | 'expert';
};

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

  userContext: Annotation<UserContext>({
    default: () => ({}),
    reducer: (current, next) => ({ ...current, ...next })
  }),
});

export type AgentStateType = typeof BrainstormStateAnnotation.State;

/**
 * Type definition for Agent LangGraph data
 */
export type AgentLanggraphData = LanggraphData<
  AgentStateType,
  typeof agentOutputSchema
>;
