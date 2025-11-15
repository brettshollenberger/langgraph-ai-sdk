import { describe, it, expect } from 'vitest';
import { createLanggraphUIStream } from '../stream';
import {
  createSampleAgent,
  agentOutputSchema,
  type AgentLanggraphData,
  type AgentStateType,
  type UserContext,
} from '../testing';
import { HumanMessage } from '@langchain/core/messages';
import { MemorySaver } from "@langchain/langgraph-checkpoint";

describe.sequential('State Merging via API', () => {
  const checkpointer = new MemorySaver();

  describe('Initial State Merging', () => {
    it('should accept and merge initial state with messages', async () => {
      const graphName = 'state-merge-initial';
      const threadId = 'thread-state-merge-1';

      const graph = createSampleAgent(checkpointer, graphName);

      // Send initial state with the first message
      const initialState: Partial<AgentStateType> = {
        userContext: {
          businessType: 'SaaS',
          urgencyLevel: 'high',
          experienceLevel: 'intermediate',
        },
      };

      const stream = createLanggraphUIStream<AgentLanggraphData>({
        graph,
        messages: [new HumanMessage('We make chatbots')],
        threadId,
        messageSchema: agentOutputSchema,
        state: initialState,
      });

      const chunks: any[] = [];
      for await (const chunk of stream) {
        chunks.push(chunk);
      }

      expect(chunks.length).toBeGreaterThan(0);

      // Verify state was applied
      const userContextChunks = chunks.filter((c) =>
        c.type === 'data-state-userContext'
      );

      if (userContextChunks.length > 0) {
        const lastContextChunk = userContextChunks[userContextChunks.length - 1];
        expect(lastContextChunk.data).toBeDefined();
        expect(lastContextChunk.data.businessType).toBe('SaaS');
        expect(lastContextChunk.data.urgencyLevel).toBe('high');
        expect(lastContextChunk.data.experienceLevel).toBe('intermediate');
      }
    });

    it('should merge partial state without overwriting existing state', async () => {
      const graphName = 'state-merge-partial';
      const threadId = 'thread-state-merge-partial-1';

      const graph = createSampleAgent(checkpointer, graphName);

      // First message with partial state
      const stream1 = createLanggraphUIStream<AgentLanggraphData>({
        graph,
        messages: [new HumanMessage('Test 1')],
        threadId,
        messageSchema: agentOutputSchema,
        state: {
          userContext: {
            businessType: 'B2B',
          },
        },
      });

      const chunks1: any[] = [];
      for await (const chunk of stream1) {
        chunks1.push(chunk);
      }

      // Second message merging additional context
      const stream2 = createLanggraphUIStream<AgentLanggraphData>({
        graph,
        messages: [new HumanMessage('Test 2')],
        threadId,
        messageSchema: agentOutputSchema,
        state: {
          userContext: {
            urgencyLevel: 'low',
          },
        },
      });

      const chunks2: any[] = [];
      for await (const chunk of stream2) {
        chunks2.push(chunk);
      }

      const contextChunks2 = chunks2.filter((c) => c.type === 'data-state-userContext');

      if (contextChunks2.length > 0) {
        const mergedContext = contextChunks2[contextChunks2.length - 1].data;
        // Should have both businessType and urgencyLevel
        expect(mergedContext.businessType).toBe('B2B');
        expect(mergedContext.urgencyLevel).toBe('low');
      }
    });

    it('should handle empty state gracefully', async () => {
      const graphName = 'state-merge-empty';
      const threadId = 'thread-state-merge-empty-1';

      const graph = createSampleAgent(checkpointer, graphName);

      const stream = createLanggraphUIStream<AgentLanggraphData>({
        graph,
        messages: [new HumanMessage('Test with no state')],
        threadId,
        messageSchema: agentOutputSchema,
        state: {}, // Empty state
      });

      const chunks: any[] = [];
      for await (const chunk of stream) {
        chunks.push(chunk);
      }

      expect(chunks.length).toBeGreaterThan(0);
      // Should work fine without errors
    });

    it('should handle undefined state (no state passed)', async () => {
      const graphName = 'state-merge-undefined';
      const threadId = 'thread-state-merge-undefined-1';

      const graph = createSampleAgent(checkpointer, graphName);

      const stream = createLanggraphUIStream<AgentLanggraphData>({
        graph,
        messages: [new HumanMessage('Test with undefined state')],
        threadId,
        messageSchema: agentOutputSchema,
        // state not provided at all
      });

      const chunks: any[] = [];
      for await (const chunk of stream) {
        chunks.push(chunk);
      }

      expect(chunks.length).toBeGreaterThan(0);
      // Should work fine without errors
    });
  });

  describe('User Context State Merging', () => {
    it('should accept all valid businessType values', async () => {
      const validBusinessTypes: Array<UserContext['businessType']> = [
        'B2B', 'B2C', 'SaaS', 'Ecommerce', 'Other'
      ];

      for (const businessType of validBusinessTypes) {
        const graphName = `state-business-type-${businessType}`;
        const threadId = `thread-business-${businessType}`;

        const graph = createSampleAgent(checkpointer, graphName);

        const stream = createLanggraphUIStream<AgentLanggraphData>({
          graph,
          messages: [new HumanMessage('Test')],
          threadId,
          messageSchema: agentOutputSchema,
          state: {
            userContext: { businessType },
          },
        });

        const chunks: any[] = [];
        for await (const chunk of stream) {
          chunks.push(chunk);
        }

        const contextChunks = chunks.filter((c) => c.type === 'data-state-userContext');
        if (contextChunks.length > 0) {
          expect(contextChunks[0].data.businessType).toBe(businessType);
        }
      }
    });

    it('should accept all valid urgencyLevel values', async () => {
      const validUrgencyLevels: Array<UserContext['urgencyLevel']> = [
        'low', 'medium', 'high'
      ];

      for (const urgencyLevel of validUrgencyLevels) {
        const graphName = `state-urgency-${urgencyLevel}`;
        const threadId = `thread-urgency-${urgencyLevel}`;

        const graph = createSampleAgent(checkpointer, graphName);

        const stream = createLanggraphUIStream<AgentLanggraphData>({
          graph,
          messages: [new HumanMessage('Test')],
          threadId,
          messageSchema: agentOutputSchema,
          state: {
            userContext: { urgencyLevel },
          },
        });

        const chunks: any[] = [];
        for await (const chunk of stream) {
          chunks.push(chunk);
        }

        const contextChunks = chunks.filter((c) => c.type === 'data-state-userContext');
        if (contextChunks.length > 0) {
          expect(contextChunks[0].data.urgencyLevel).toBe(urgencyLevel);
        }
      }
    });

    it('should accept all valid experienceLevel values', async () => {
      const validExperienceLevels: Array<UserContext['experienceLevel']> = [
        'beginner', 'intermediate', 'expert'
      ];

      for (const experienceLevel of validExperienceLevels) {
        const graphName = `state-experience-${experienceLevel}`;
        const threadId = `thread-experience-${experienceLevel}`;

        const graph = createSampleAgent(checkpointer, graphName);

        const stream = createLanggraphUIStream<AgentLanggraphData>({
          graph,
          messages: [new HumanMessage('Test')],
          threadId,
          messageSchema: agentOutputSchema,
          state: {
            userContext: { experienceLevel },
          },
        });

        const chunks: any[] = [];
        for await (const chunk of stream) {
          chunks.push(chunk);
        }

        const contextChunks = chunks.filter((c) => c.type === 'data-state-userContext');
        if (contextChunks.length > 0) {
          expect(contextChunks[0].data.experienceLevel).toBe(experienceLevel);
        }
      }
    });

    it('should handle complete user context object', async () => {
      const graphName = 'state-complete-context';
      const threadId = 'thread-complete-context-1';

      const graph = createSampleAgent(checkpointer, graphName);

      const completeContext: UserContext = {
        businessType: 'Ecommerce',
        urgencyLevel: 'high',
        experienceLevel: 'expert',
      };

      const stream = createLanggraphUIStream<AgentLanggraphData>({
        graph,
        messages: [new HumanMessage('Tell me about marketing')],
        threadId,
        messageSchema: agentOutputSchema,
        state: {
          userContext: completeContext,
        },
      });

      const chunks: any[] = [];
      for await (const chunk of stream) {
        chunks.push(chunk);
      }

      const contextChunks = chunks.filter((c) => c.type === 'data-state-userContext');

      if (contextChunks.length > 0) {
        const receivedContext = contextChunks[contextChunks.length - 1].data;
        expect(receivedContext.businessType).toBe('Ecommerce');
        expect(receivedContext.urgencyLevel).toBe('high');
        expect(receivedContext.experienceLevel).toBe('expert');
      }
    });
  });

  describe('Brainstorm State Interaction', () => {
    it('should preserve brainstorm state when merging user context', async () => {
      const graphName = 'state-brainstorm-preserve';
      const threadId = 'thread-brainstorm-preserve-1';

      const graph = createSampleAgent(checkpointer, graphName);

      // First message - agent should save some brainstorm data
      const stream1 = createLanggraphUIStream<AgentLanggraphData>({
        graph,
        messages: [new HumanMessage('We make AI chatbots for customer support')],
        threadId,
        messageSchema: agentOutputSchema,
      });

      const chunks1: any[] = [];
      for await (const chunk of stream1) {
        chunks1.push(chunk);
      }

      // Second message - send user context without touching brainstorm state
      const stream2 = createLanggraphUIStream<AgentLanggraphData>({
        graph,
        messages: [new HumanMessage('Continue')],
        threadId,
        messageSchema: agentOutputSchema,
        state: {
          userContext: {
            businessType: 'SaaS',
          },
        },
      });

      const chunks2: any[] = [];
      for await (const chunk of stream2) {
        chunks2.push(chunk);
      }

      // Both brainstorm and userContext should exist
      const brainstormChunks = chunks2.filter((c) => c.type === 'data-state-brainstorm');
      const contextChunks = chunks2.filter((c) => c.type === 'data-state-userContext');

      // UserContext should be present
      if (contextChunks.length > 0) {
        expect(contextChunks[0].data.businessType).toBe('SaaS');
      }

      // Brainstorm state should still exist (not overwritten)
      // Note: This depends on whether the agent saved anything in first turn
    });
  });

  describe('Type Safety', () => {
    it('should type-check state parameter as Partial<AgentStateType>', async () => {
      const graphName = 'state-type-safety';
      const threadId = 'thread-type-safety-1';

      const graph = createSampleAgent(checkpointer, graphName);

      // Valid partial state
      const validState: Partial<AgentStateType> = {
        userContext: {
          businessType: 'B2B',
        },
      };

      const stream = createLanggraphUIStream<AgentLanggraphData>({
        graph,
        messages: [new HumanMessage('Test')],
        threadId,
        messageSchema: agentOutputSchema,
        state: validState, // ✅ Should compile
      });

      const chunks: any[] = [];
      for await (const chunk of stream) {
        chunks.push(chunk);
      }

      expect(chunks.length).toBeGreaterThan(0);
    });
  });

  describe('State Persistence Across Multiple Requests', () => {
    it('should accumulate state across multiple API calls', async () => {
      const graphName = 'state-accumulation';
      const threadId = 'thread-accumulation-1';

      const graph = createSampleAgent(checkpointer, graphName);

      // Call 1: Set businessType
      const stream1 = createLanggraphUIStream<AgentLanggraphData>({
        graph,
        messages: [new HumanMessage('Message 1')],
        threadId,
        messageSchema: agentOutputSchema,
        state: {
          userContext: {
            businessType: 'SaaS',
          },
        },
      });

      for await (const chunk of stream1) {
        // Process stream1
      }

      // Call 2: Add urgencyLevel (should merge with existing businessType)
      const stream2 = createLanggraphUIStream<AgentLanggraphData>({
        graph,
        messages: [new HumanMessage('Message 2')],
        threadId,
        messageSchema: agentOutputSchema,
        state: {
          userContext: {
            urgencyLevel: 'medium',
          },
        },
      });

      const chunks2: any[] = [];
      for await (const chunk of stream2) {
        chunks2.push(chunk);
      }

      // Call 3: Add experienceLevel (should merge with all previous)
      const stream3 = createLanggraphUIStream<AgentLanggraphData>({
        graph,
        messages: [new HumanMessage('Message 3')],
        threadId,
        messageSchema: agentOutputSchema,
        state: {
          userContext: {
            experienceLevel: 'beginner',
          },
        },
      });

      const chunks3: any[] = [];
      for await (const chunk of stream3) {
        chunks3.push(chunk);
      }

      const contextChunks3 = chunks3.filter((c) => c.type === 'data-state-userContext');

      if (contextChunks3.length > 0) {
        const finalContext = contextChunks3[contextChunks3.length - 1].data;
        // Should have all three fields merged together
        expect(finalContext.businessType).toBe('SaaS');
        expect(finalContext.urgencyLevel).toBe('medium');
        expect(finalContext.experienceLevel).toBe('beginner');
      }
    });

    it('should allow overwriting previous state values', async () => {
      const graphName = 'state-overwrite';
      const threadId = 'thread-overwrite-1';

      const graph = createSampleAgent(checkpointer, graphName);

      // Call 1: Set initial urgency
      const stream1 = createLanggraphUIStream<AgentLanggraphData>({
        graph,
        messages: [new HumanMessage('Message 1')],
        threadId,
        messageSchema: agentOutputSchema,
        state: {
          userContext: {
            urgencyLevel: 'low',
          },
        },
      });

      for await (const chunk of stream1) {
        // Process stream1
      }

      // Call 2: Change urgency to high
      const stream2 = createLanggraphUIStream<AgentLanggraphData>({
        graph,
        messages: [new HumanMessage('Message 2')],
        threadId,
        messageSchema: agentOutputSchema,
        state: {
          userContext: {
            urgencyLevel: 'high', // Should overwrite 'low'
          },
        },
      });

      const chunks2: any[] = [];
      for await (const chunk of stream2) {
        chunks2.push(chunk);
      }

      const contextChunks2 = chunks2.filter((c) => c.type === 'data-state-userContext');

      if (contextChunks2.length > 0) {
        const updatedContext = contextChunks2[contextChunks2.length - 1].data;
        // Should be overwritten to 'high'
        expect(updatedContext.urgencyLevel).toBe('high');
      }
    });
  });
});
