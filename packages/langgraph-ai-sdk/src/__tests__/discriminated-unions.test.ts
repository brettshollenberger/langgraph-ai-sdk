import { describe, it, expect } from 'vitest';
import { createLanggraphUIStream } from '../stream';
import {
  createSampleAgent,
  agentOutputSchema,
  questionSchema,
  marketingTemplateSchema,
  type AgentLanggraphData,
} from '../testing';
import { HumanMessage } from '@langchain/core/messages';
import { MemorySaver } from "@langchain/langgraph-checkpoint";
import type { SimpleLanggraphUIMessage } from 'langgraph-ai-sdk-types';

describe('Discriminated Union Types', () => {
  const checkpointer = new MemorySaver();

  describe('Type Safety with Multiple Schemas', () => {
    it('should properly infer discriminated union from schema array', () => {
      // This test verifies that TypeScript correctly infers the discriminated union
      // The agentOutputSchema is [questionSchema, marketingTemplateSchema] as const

      type AgentMessage = SimpleLanggraphUIMessage<AgentLanggraphData>;

      // Mock messages to test type narrowing
      const questionMsg: AgentMessage = {
        id: '1',
        role: 'assistant',
        type: 'question',
        text: 'What is your business?',
        examples: ['Example 1', 'Example 2'],
        conclusion: 'Please be specific',
      };

      const templateMsg: AgentMessage = {
        id: '2',
        role: 'assistant',
        type: 'marketingTemplate',
        headline: 'Transform Your Business',
        valueProposition: 'We help you grow',
        callToAction: 'Get Started',
        tone: 'professional' as const,
      };

      const textMsg: AgentMessage = {
        id: '3',
        role: 'user',
        type: 'text',
        text: 'Hello',
      };

      // Type narrowing tests
      if (questionMsg.type === 'question') {
        // TypeScript should know these fields exist
        expect(questionMsg.text).toBeDefined();
        expect(questionMsg.examples).toBeDefined();
        // @ts-expect-error - headline doesn't exist on question type
        const shouldError = questionMsg.headline;
      }

      if (templateMsg.type === 'marketingTemplate') {
        // TypeScript should know these fields exist
        expect(templateMsg.headline).toBeDefined();
        expect(templateMsg.valueProposition).toBeDefined();
        expect(templateMsg.callToAction).toBeDefined();
        expect(templateMsg.tone).toBe('professional');
        // @ts-expect-error - examples doesn't exist on template type
        const shouldError = templateMsg.examples;
      }

      if (textMsg.type === 'text') {
        // TypeScript should know text field exists
        expect(textMsg.text).toBeDefined();
        // @ts-expect-error - headline doesn't exist on text type
        const shouldError = textMsg.headline;
      }

      expect(questionMsg.type).toBe('question');
      expect(templateMsg.type).toBe('marketingTemplate');
      expect(textMsg.type).toBe('text');
    });

    it('should handle exhaustive type checking with switch statements', () => {
      type AgentMessage = SimpleLanggraphUIMessage<AgentLanggraphData>;

      const messages: AgentMessage[] = [
        {
          id: '1',
          role: 'assistant',
          type: 'question',
          text: 'What is your idea?',
        },
        {
          id: '2',
          role: 'assistant',
          type: 'marketingTemplate',
          headline: 'Grow Fast',
          valueProposition: 'Scale your business',
          callToAction: 'Start Now',
          tone: 'urgent' as const,
        },
      ];

      const results = messages.map(msg => {
        switch (msg.type) {
          case 'question':
            return { messageType: 'question', hasText: !!msg.text };
          case 'marketingTemplate':
            return { messageType: 'template', hasHeadline: !!msg.headline };
          case 'text':
            return { messageType: 'text', hasText: !!msg.text };
          default:
            // This should catch any unhandled types
            const exhaustive: never = msg;
            return exhaustive;
        }
      });

      expect(results[0]).toEqual({ messageType: 'question', hasText: true });
      expect(results[1]).toEqual({ messageType: 'template', hasHeadline: true });
    });
  });

  describe('Runtime Streaming with Multiple Schemas', () => {
    it('should stream question messages with proper discriminator', async () => {
      const graphName = 'discriminated-union-question';
      const threadId = 'thread-question-1';

      const graph = createSampleAgent(checkpointer, graphName);

      const stream = createLanggraphUIStream<AgentLanggraphData>({
        graph,
        messages: [new HumanMessage('We make chatbots')],
        threadId,
        messageSchema: agentOutputSchema,
      });

      const chunks: any[] = [];
      for await (const chunk of stream) {
        chunks.push(chunk);
      }

      expect(chunks.length).toBeGreaterThan(0);

      // Look for question-specific fields
      const questionTextChunks = chunks.filter((c) => c.type === 'data-message-text');
      const examplesChunks = chunks.filter((c) => c.type === 'data-message-examples');

      // Agent should ask a question
      expect(questionTextChunks.length).toBeGreaterThan(0);

      if (questionTextChunks.length > 0) {
        const lastTextChunk = questionTextChunks[questionTextChunks.length - 1];
        expect(typeof lastTextChunk.data).toBe('string');
        expect(lastTextChunk.data.length).toBeGreaterThan(0);
      }

      // May or may not have examples, but if it does, verify structure
      if (examplesChunks.length > 0) {
        const examplesChunk = examplesChunks[0];
        expect(Array.isArray(examplesChunk.data)).toBe(true);
      }
    });

    it('should collect all keys from multiple schemas for streaming', async () => {
      // This test verifies that getSchemaKeys collects keys from all schemas in the array
      const graphName = 'multi-schema-keys';
      const threadId = 'thread-keys-1';

      const graph = createSampleAgent(checkpointer, graphName);

      const stream = createLanggraphUIStream<AgentLanggraphData>({
        graph,
        messages: [new HumanMessage('Test message')],
        threadId,
        messageSchema: agentOutputSchema,
      });

      const chunks: any[] = [];
      for await (const chunk of stream) {
        chunks.push(chunk);
      }

      // The stream should handle both question and marketingTemplate fields
      // Even though only one type is returned at a time, the infrastructure
      // should be able to handle keys from both schemas

      const messageChunks = chunks.filter((c) => c.type.startsWith('data-message-'));
      expect(messageChunks.length).toBeGreaterThan(0);

      // Verify that we're getting properly typed message chunks
      messageChunks.forEach(chunk => {
        expect(chunk.type).toMatch(/^data-message-/);
        expect(chunk.id).toBeTruthy();
        expect(chunk.data).toBeDefined();
      });
    });
  });

  describe('Type Inference from Schema Array', () => {
    it('should infer union type from readonly schema array', () => {
      // Verify that the const assertion preserves literal types
      type SchemaArray = typeof agentOutputSchema;
      type InferredType = SchemaArray extends readonly [infer S1, infer S2] ? [S1, S2] : never;

      // This should be [typeof questionSchema, typeof marketingTemplateSchema]
      // The test passes if TypeScript can infer the types correctly
      const schemas: SchemaArray = agentOutputSchema;

      expect(schemas.length).toBe(2);
      expect(schemas[0]).toBe(questionSchema);
      expect(schemas[1]).toBe(marketingTemplateSchema);
    });

    it('should preserve literal discriminator types', () => {
      // Question schema should have literal "question" type
      const questionType = questionSchema.shape.type;
      expect(questionType._def.value).toBe('question');

      // MarketingTemplate schema should have literal "marketingTemplate" type
      const templateType = marketingTemplateSchema.shape.type;
      expect(templateType._def.value).toBe('marketingTemplate');
    });

    it('should create proper discriminated union from inferred types', () => {
      type AgentMessage = SimpleLanggraphUIMessage<AgentLanggraphData>;

      // This helper function demonstrates exhaustive type checking
      function getMessageKind(msg: AgentMessage): 'question' | 'template' | 'text' | 'other' {
        if (msg.type === 'question') return 'question';
        if (msg.type === 'marketingTemplate') return 'template';
        if (msg.type === 'text') return 'text';
        return 'other';
      }

      const questionMsg: AgentMessage = {
        id: '1',
        role: 'assistant',
        type: 'question',
        text: 'Test?',
      };

      const templateMsg: AgentMessage = {
        id: '2',
        role: 'assistant',
        type: 'marketingTemplate',
        headline: 'Title',
        valueProposition: 'Value',
        callToAction: 'Action',
        tone: 'friendly' as const,
      };

      expect(getMessageKind(questionMsg)).toBe('question');
      expect(getMessageKind(templateMsg)).toBe('template');
    });
  });

  describe('Optional Fields in Discriminated Union', () => {
    it('should handle optional fields correctly in question type', () => {
      type AgentMessage = SimpleLanggraphUIMessage<AgentLanggraphData>;

      // Question with all optional fields
      const fullQuestion: AgentMessage = {
        id: '1',
        role: 'assistant',
        type: 'question',
        text: 'Main question',
        examples: ['Ex 1', 'Ex 2'],
        conclusion: 'Conclusion text',
      };

      // Question with minimal fields
      const minimalQuestion: AgentMessage = {
        id: '2',
        role: 'assistant',
        type: 'question',
        text: 'Just the question',
      };

      if (fullQuestion.type === 'question') {
        expect(fullQuestion.text).toBe('Main question');
        expect(fullQuestion.examples).toEqual(['Ex 1', 'Ex 2']);
        expect(fullQuestion.conclusion).toBe('Conclusion text');
      }

      if (minimalQuestion.type === 'question') {
        expect(minimalQuestion.text).toBe('Just the question');
        expect(minimalQuestion.examples).toBeUndefined();
        expect(minimalQuestion.conclusion).toBeUndefined();
      }
    });

    it('should handle optional fields correctly in template type', () => {
      type AgentMessage = SimpleLanggraphUIMessage<AgentLanggraphData>;

      // Template with all optional fields
      const fullTemplate: AgentMessage = {
        id: '1',
        role: 'assistant',
        type: 'marketingTemplate',
        headline: 'Big Headline',
        subheadline: 'Supporting text',
        valueProposition: 'Unique value',
        bulletPoints: ['Point 1', 'Point 2', 'Point 3'],
        callToAction: 'Click Here',
        tone: 'playful' as const,
        socialProofSnippet: 'Testimonial text',
      };

      // Template with minimal required fields
      const minimalTemplate: AgentMessage = {
        id: '2',
        role: 'assistant',
        type: 'marketingTemplate',
        headline: 'Headline',
        valueProposition: 'Value',
        callToAction: 'Action',
        tone: 'professional' as const,
      };

      if (fullTemplate.type === 'marketingTemplate') {
        expect(fullTemplate.subheadline).toBe('Supporting text');
        expect(fullTemplate.bulletPoints).toHaveLength(3);
        expect(fullTemplate.socialProofSnippet).toBe('Testimonial text');
      }

      if (minimalTemplate.type === 'marketingTemplate') {
        expect(minimalTemplate.subheadline).toBeUndefined();
        expect(minimalTemplate.bulletPoints).toBeUndefined();
        expect(minimalTemplate.socialProofSnippet).toBeUndefined();
      }
    });
  });

  describe('Tone Enum in Marketing Template', () => {
    it('should only accept valid tone values', () => {
      type AgentMessage = SimpleLanggraphUIMessage<AgentLanggraphData>;

      const validTones = ['professional', 'friendly', 'urgent', 'authoritative', 'playful'] as const;

      validTones.forEach(tone => {
        const msg: AgentMessage = {
          id: '1',
          role: 'assistant',
          type: 'marketingTemplate',
          headline: 'Test',
          valueProposition: 'Test',
          callToAction: 'Test',
          tone,
        };

        if (msg.type === 'marketingTemplate') {
          expect(validTones).toContain(msg.tone);
        }
      });
    });

    it('should provide type safety for tone field', () => {
      type AgentMessage = SimpleLanggraphUIMessage<AgentLanggraphData>;

      const msg: AgentMessage = {
        id: '1',
        role: 'assistant',
        type: 'marketingTemplate',
        headline: 'Test',
        valueProposition: 'Test',
        callToAction: 'Test',
        tone: 'authoritative',
      };

      if (msg.type === 'marketingTemplate') {
        // TypeScript should know tone is a specific union type
        type ToneType = typeof msg.tone;
        const tone: ToneType = msg.tone;

        expect(['professional', 'friendly', 'urgent', 'authoritative', 'playful']).toContain(tone);
      }
    });
  });
});
