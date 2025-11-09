import { describe, it, expect } from 'vitest';
import { createLanggraphUIStream } from '../stream';
import { 
  createSampleGraph, 
  createSampleAgent,
  structuredMessageSchema, 
  questionSchema,
  type AgentLanggraphData,
  type GraphLanggraphData 
} from '../testing';
import { HumanMessage } from '@langchain/core/messages';
import { MemorySaver } from "@langchain/langgraph-checkpoint";

export const checkpointer = new MemorySaver();
export const graphParams = { checkpointer };

describe('End-to-End Streaming Tests', () => {

  describe('State Updates', () => {
    it('should stream state updates as data-state-* parts with proper typing', async () => {
      const graphName = 'e2e-state-test';
      const threadId = 'thread-state-1';

      const graph = createSampleGraph(undefined, graphName);

      const stream = createLanggraphUIStream<GraphLanggraphData>({
        graph,
        messages: [new HumanMessage('Create a new project')],
        threadId,
        messageSchema: structuredMessageSchema,
      });

      const chunks: any[] = [];
      for await (const chunk of stream) {
        chunks.push(chunk);
      }

      expect(chunks.length).toBeGreaterThan(0);

      const stateChunks = chunks.filter((c) => c.type.startsWith('data-state-'));
      const projectNameChunks = stateChunks.filter((c) => c.type === 'data-state-projectName');

      if (projectNameChunks.length > 0) {
        const lastProjectNameChunk = projectNameChunks[projectNameChunks.length - 1];
        // Real LLM will generate a project name - just verify it's a non-empty string
        expect(typeof lastProjectNameChunk.data).toBe('string');
        expect(lastProjectNameChunk.data.length).toBeGreaterThan(0);
        expect(lastProjectNameChunk.id).toBeTruthy();
        expect(typeof lastProjectNameChunk.id).toBe('string');
      }
    });

    it('should maintain stable IDs across state updates', async () => {
      const graphName = 'e2e-stable-state-test';
      const threadId = 'thread-stable-state-1';

      const graph = createSampleGraph(undefined, graphName);

      const stream = createLanggraphUIStream<GraphLanggraphData>({
        graph,
        messages: [new HumanMessage('Test')],
        threadId,
        messageSchema: structuredMessageSchema,
      });

      const chunks: any[] = [];
      for await (const chunk of stream) {
        chunks.push(chunk);
      }

      const projectNameChunks = chunks.filter((c) => c.type === 'data-state-projectName');

      if (projectNameChunks.length > 1) {
        const firstId = projectNameChunks[0].id;
        projectNameChunks.forEach((chunk) => {
          expect(chunk.id).toBe(firstId);
        });
      }
    });
  });

  describe('Structured Messages', () => {
    it('should stream structured message parts with proper typing', async () => {
      const graphName = 'e2e-structured-msg-test';
      const threadId = 'thread-structured-1';

      const graph = createSampleGraph(undefined, graphName);

      const stream = createLanggraphUIStream<GraphLanggraphData>({
        graph,
        messages: [new HumanMessage('Tell me about structured messages')],
        threadId,
        messageSchema: structuredMessageSchema,
      });

      const chunks: any[] = [];
      for await (const chunk of stream) {
        chunks.push(chunk);
      }

      expect(chunks.length).toBeGreaterThan(0);

      const introChunks = chunks.filter((c) => c.type === 'data-message-intro');
      const examplesChunks = chunks.filter((c) => c.type === 'data-message-examples');
      const conclusionChunks = chunks.filter((c) => c.type === 'data-message-conclusion');

      if (introChunks.length > 0) {
        const lastIntroChunk = introChunks[introChunks.length - 1];
        // Real LLM will generate intro text - just verify it's a non-empty string
        expect(typeof lastIntroChunk.data).toBe('string');
        expect(lastIntroChunk.data.length).toBeGreaterThan(0);
        expect(lastIntroChunk.id).toBeTruthy();
      }

      if (examplesChunks.length > 0) {
        const lastExamplesChunk = examplesChunks[examplesChunks.length - 1];
        // Real LLM will generate examples - just verify it's a non-empty array
        expect(Array.isArray(lastExamplesChunk.data)).toBe(true);
        expect(lastExamplesChunk.data.length).toBeGreaterThan(0);
      }

      if (conclusionChunks.length > 0) {
        const lastConclusionChunk = conclusionChunks[conclusionChunks.length - 1];
        // Real LLM will generate conclusion text - just verify it's a non-empty string
        expect(typeof lastConclusionChunk.data).toBe('string');
        expect(lastConclusionChunk.data.length).toBeGreaterThan(0);
      }
    });

    it('should maintain stable IDs for message parts across streaming', async () => {
      const graphName = 'e2e-stable-msg-test';
      const threadId = 'thread-stable-msg-1';

      const graph = createSampleGraph(undefined, graphName);

      const stream = createLanggraphUIStream<GraphLanggraphData>({
        graph,
        messages: [new HumanMessage('Test stable IDs')],
        threadId,
        messageSchema: structuredMessageSchema,
      });

      const chunks: any[] = [];
      for await (const chunk of stream) {
        chunks.push(chunk);
      }

      const introChunks = chunks.filter((c) => c.type === 'data-message-intro');

      if (introChunks.length > 1) {
        const firstId = introChunks[0].id;
        introChunks.forEach((chunk) => {
          expect(chunk.id).toBe(firstId);
        });
      }
    });

    it('should handle structured message schema correctly', async () => {
      const graphName = 'e2e-structured-msg-test';
      const threadId = 'thread-structured-2';

      const graph = createSampleGraph(undefined, graphName);

      const stream = createLanggraphUIStream<GraphLanggraphData>({
        graph,
        messages: [new HumanMessage('Tell me about structured messages')],
        threadId,
        messageSchema: structuredMessageSchema,
      });

      const chunks: any[] = [];
      for await (const chunk of stream) {
        chunks.push(chunk);
      }

      expect(chunks.length).toBeGreaterThan(0);

      const introChunks = chunks.filter((c) => c.type === 'data-message-intro');
      const bulletPointsChunks = chunks.filter((c) => c.type === 'data-message-bulletPoints');
      const conclusionChunks = chunks.filter((c) => c.type === 'data-message-conclusion');

      // Verify that all expected structured message parts are present
      expect(introChunks.length).toBeGreaterThan(0);
      expect(bulletPointsChunks.length).toBeGreaterThan(0);
      expect(conclusionChunks.length).toBeGreaterThan(0);
    });
  });

  describe('Simple Text Messages', () => {
    it('should stream simple text messages when no schema is provided', async () => {
      const graphName = 'e2e-simple-text-test';
      const threadId = 'thread-simple-1';

      const graph = createSampleGraph(undefined, graphName);

      const stream = createLanggraphUIStream<GraphLanggraphData>({
        graph,
        messages: [new HumanMessage('Simple message test')],
        threadId,
      });

      const chunks: any[] = [];
      for await (const chunk of stream) {
        chunks.push(chunk);
      }

      expect(chunks.length).toBeGreaterThan(0);

      // When no messageSchema is provided, the graph still uses structured output internally
      // but the stream handler won't process it (since no schema is passed to createLanggraphUIStream)
      // So we should get AI message chunks but not structured message chunks
      const messageChunks = chunks.filter((c) => c.type.startsWith('data-message-'));

      // Since no schema is passed to the stream, we won't get structured message parts
      // This test verifies that the stream completes successfully even without a schema
      expect(chunks.length).toBeGreaterThan(0);
    });
  });

  describe('Custom Events', () => {
    it('should stream custom events from graph nodes', async () => {
      const graphName = 'e2e-custom-events-test';
      const threadId = 'thread-custom-1';

      const graph = createSampleGraph(undefined, graphName);

      const stream = createLanggraphUIStream<GraphLanggraphData>({
        graph,
        messages: [new HumanMessage('Test custom events')],
        threadId,
        messageSchema: structuredMessageSchema,
      });

      const chunks: any[] = [];
      for await (const chunk of stream) {
        chunks.push(chunk);
      }

      expect(chunks.length).toBeGreaterThan(0);

      const customChunks = chunks.filter((c) => c.type.startsWith('data-custom-'));

      customChunks.forEach((chunk) => {
        expect(chunk.id).toBeTruthy();
        expect(chunk.data).toBeDefined();
        expect(typeof chunk.type).toBe('string');
      });
    });
  });

  describe('Full Stream Flow', () => {
    it('should stream complete graph execution with all chunk types', async () => {
      const graphName = 'e2e-full-flow-test';
      const threadId = 'thread-full-1';

      const graph = createSampleGraph(undefined, graphName);

      const stream = createLanggraphUIStream<GraphLanggraphData>({
        graph,
        messages: [new HumanMessage('Execute full flow')],
        threadId,
        messageSchema: structuredMessageSchema,
      });

      const allChunks: any[] = [];
      const messageChunks: any[] = [];
      const stateChunks: any[] = [];
      const customChunks: any[] = [];

      for await (const chunk of stream) {
        allChunks.push(chunk);

        if (chunk.type.startsWith('data-message-')) {
          messageChunks.push(chunk);
        } else if (chunk.type.startsWith('data-state-')) {
          stateChunks.push(chunk);
        } else if (chunk.type.startsWith('data-custom-')) {
          customChunks.push(chunk);
        }
      }

      expect(allChunks.length).toBeGreaterThan(0);

      expect(stateChunks.length).toBeGreaterThan(0);
      expect(messageChunks.length).toBeGreaterThan(0);
      expect(customChunks.length).toBeGreaterThan(0);

      allChunks.forEach((chunk) => {
        expect(chunk.id).toBeTruthy();
        expect(chunk.data).toBeDefined();
      });
    });

    it('should stream complete agent execution with all chunk types', async () => {
      const graphName = 'e2e-full-flow-test';
      const threadId = 'thread-full-1';

      const agent = createSampleAgent(checkpointer, graphName);

      const stream = createLanggraphUIStream<AgentLanggraphData>({
        graph: agent,
        messages: [new HumanMessage('Execute full flow')],
        threadId,
        messageSchema: questionSchema,
      });

      const allChunks: any[] = [];
      const messageChunks: any[] = [];
      const stateChunks: any[] = [];
      const customChunks: any[] = [];

      for await (const chunk of stream) {
        allChunks.push(chunk);

        if (chunk.type.startsWith('data-message-')) {
          messageChunks.push(chunk);
        } else if (chunk.type.startsWith('data-state-')) {
          stateChunks.push(chunk);
        } else if (chunk.type.startsWith('data-custom-')) {
          customChunks.push(chunk);
        }
      }

      expect(allChunks.length).toBeGreaterThan(0);

      expect(stateChunks.length).toBeGreaterThan(0);
      expect(messageChunks.length).toBeGreaterThan(0);
      expect(customChunks.length).toBeGreaterThan(0);

      allChunks.forEach((chunk) => {
        expect(chunk.id).toBeTruthy();
        expect(chunk.data).toBeDefined();
      });
    });
  });

  describe('Type Safety', () => {
    it('should properly type all stream outputs', async () => {
      const graphName = 'e2e-type-safety-test';
      const threadId = 'thread-types-1';

      const graph = createSampleGraph(undefined, graphName);

      const stream = createLanggraphUIStream<GraphLanggraphData>({
        graph,
        messages: [new HumanMessage('Test types')],
        threadId,
        messageSchema: structuredMessageSchema,
      });

      const chunks: any[] = [];
      for await (const chunk of stream) {
        chunks.push(chunk);
        
        expect(chunk).toHaveProperty('type');
        expect(typeof chunk.type).toBe('string');
        
        if ('id' in chunk) {
          expect(typeof chunk.id).toBe('string');
        }
        
        if ('data' in chunk) {
          expect(chunk.data).toBeDefined();
        }
      }

      expect(chunks.length).toBeGreaterThan(0);
    });
  });
});
