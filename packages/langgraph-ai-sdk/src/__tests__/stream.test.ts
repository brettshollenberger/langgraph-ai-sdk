import { describe, it, expect, beforeEach } from 'vitest';
import { createLanggraphUIStream, loadThreadHistory } from '../stream';
import {
  createSampleGraph,
  sampleMessageSchema,
  configureResponses,
  type SampleLanggraphData,
} from '../testing';
import { HumanMessage } from '@langchain/core/messages';

describe('Streaming Infrastructure', () => {
  describe('createLanggraphUIStream', () => {
    it('should stream state updates as data-state-* parts', async () => {
      const graphName = 'test-graph-state';
      const threadId = 'thread-123';

      // Configure mock responses
      // Note: nameProjectNode uses withStructuredOutput which expects raw JSON
      configureResponses({
        [graphName]: {
          nameProjectNode: [{ projectName: "Project Alpha" }],
          responseNode: [
            {
              intro: 'Welcome to the project',
              examples: ['example1', 'example2'],
              conclusion: 'Get started today',
            },
          ],
        },
      });

      // Create graph without checkpointer for testing
      const graph = createSampleGraph(undefined, graphName);

      // Create stream
      const stream = createLanggraphUIStream<SampleLanggraphData>({
        graph,
        messages: [new HumanMessage('Tell me about the project')],
        threadId,
        messageSchema: sampleMessageSchema,
      });

      // Collect all chunks
      const chunks: any[] = [];
      for await (const chunk of stream) {
        chunks.push(chunk);
      }

      // Should receive state update for projectName
      const projectNameChunks = chunks.filter(
        (c) => c.type === 'data-state-projectName'
      );
      expect(projectNameChunks.length).toBeGreaterThan(0);

      // Get the last chunk (most recent state)
      const projectNameChunk = projectNameChunks[projectNameChunks.length - 1];
      expect(projectNameChunk?.data).toBe('Project Alpha');

      // Should have a stable ID
      expect(projectNameChunk?.id).toBeTruthy();
    });

    it('should stream structured message parts as data-message-* parts', async () => {
      const graphName = 'test-graph-message';
      const threadId = 'thread-456';

      configureResponses({
        [graphName]: {
          nameProjectNode: [{ projectName: "Project Beta" }],
          responseNode: [
            {
              intro: 'Introduction text',
              examples: ['ex1', 'ex2', 'ex3'],
              conclusion: 'Conclusion text',
            },
          ],
        },
      });

      const graph = createSampleGraph(undefined, graphName);

      const stream = createLanggraphUIStream<SampleLanggraphData>({
        graph,
        messages: [new HumanMessage('What is this?')],
        threadId,
        messageSchema: sampleMessageSchema,
      });

      const chunks: any[] = [];
      for await (const chunk of stream) {
        chunks.push(chunk);
      }

      // Should receive message parts - get the last chunk of each type since streaming is progressive
      const introChunks = chunks.filter((c) => c.type === 'data-message-intro');
      const examplesChunks = chunks.filter(
        (c) => c.type === 'data-message-examples'
      );
      const conclusionChunks = chunks.filter(
        (c) => c.type === 'data-message-conclusion'
      );

      expect(introChunks.length).toBeGreaterThan(0);
      const introChunk = introChunks[introChunks.length - 1];
      expect(introChunk?.data).toBe('Introduction text');

      expect(examplesChunks.length).toBeGreaterThan(0);
      const examplesChunk = examplesChunks[examplesChunks.length - 1];
      expect(examplesChunk?.data).toEqual(['ex1', 'ex2', 'ex3']);

      expect(conclusionChunks.length).toBeGreaterThan(0);
      const conclusionChunk = conclusionChunks[conclusionChunks.length - 1];
      expect(conclusionChunk?.data).toBe('Conclusion text');

      // Each part should have a stable ID
      expect(introChunk?.id).toBeTruthy();
      expect(examplesChunk?.id).toBeTruthy();
      expect(conclusionChunk?.id).toBeTruthy();
    });

    it('should handle simple message format without schema', async () => {
      const graphName = 'test-graph-simple';
      const threadId = 'thread-789';

      configureResponses({
        [graphName]: {
          nameProjectNode: [{ projectName: "Project Gamma" }],
          responseNode: ['Simple text response'],
        },
      });

      const graph = createSampleGraph(undefined, graphName);

      const stream = createLanggraphUIStream<SampleLanggraphData>({
        graph,
        messages: [new HumanMessage('Hello')],
        threadId,
        // No messageSchema - should use simple text format
      });

      const chunks: any[] = [];
      for await (const chunk of stream) {
        chunks.push(chunk);
      }

      // Should receive text message - get the last chunk since streaming is progressive
      const textChunks = chunks.filter((c) => c.type === 'data-message-text');
      expect(textChunks.length).toBeGreaterThan(0);
      const textChunk = textChunks[textChunks.length - 1];
      expect(textChunk?.data).toContain('Simple text response');
    });

    it('should progressively stream partial JSON responses', async () => {
      const graphName = 'test-graph-progressive';
      const threadId = 'thread-progressive';

      // Mock response that simulates progressive JSON streaming
      configureResponses({
        [graphName]: {
          nameProjectNode: [{ projectName: "Progressive Project" }],
          responseNode: [
            {
              intro: 'First part',
              examples: ['item1', 'item2'],
              conclusion: 'Final part',
            },
          ],
        },
      });

      const graph = createSampleGraph(undefined, graphName);

      const stream = createLanggraphUIStream<SampleLanggraphData>({
        graph,
        messages: [new HumanMessage('Test progressive')],
        threadId,
        messageSchema: sampleMessageSchema,
      });

      const chunks: any[] = [];
      for await (const chunk of stream) {
        chunks.push(chunk);
      }

      // Should receive all parts
      const introParts = chunks.filter((c) => c.type === 'data-message-intro');
      const examplesParts = chunks.filter(
        (c) => c.type === 'data-message-examples'
      );
      const conclusionParts = chunks.filter(
        (c) => c.type === 'data-message-conclusion'
      );

      expect(introParts.length).toBeGreaterThan(0);
      expect(examplesParts.length).toBeGreaterThan(0);
      expect(conclusionParts.length).toBeGreaterThan(0);

      // Final values should be correct
      const finalIntro = introParts[introParts.length - 1];
      const finalExamples = examplesParts[examplesParts.length - 1];
      const finalConclusion = conclusionParts[conclusionParts.length - 1];

      expect(finalIntro?.data).toBe('First part');
      expect(finalExamples?.data).toEqual(['item1', 'item2']);
      expect(finalConclusion?.data).toBe('Final part');
    });

    it('should maintain stable IDs across multiple chunks of same part', async () => {
      const graphName = 'test-graph-stable-ids';
      const threadId = 'thread-stable';

      configureResponses({
        [graphName]: {
          nameProjectNode: [{ projectName: "Stable Project" }],
          responseNode: [
            {
              intro: 'Test intro',
              examples: ['a', 'b'],
              conclusion: 'Test conclusion',
            },
          ],
        },
      });

      const graph = createSampleGraph(undefined, graphName);

      const stream = createLanggraphUIStream<SampleLanggraphData>({
        graph,
        messages: [new HumanMessage('Test')],
        threadId,
        messageSchema: sampleMessageSchema,
      });

      const chunks: any[] = [];
      for await (const chunk of stream) {
        chunks.push(chunk);
      }

      // Get all intro chunks
      const introChunks = chunks.filter((c) => c.type === 'data-message-intro');

      // All intro chunks should have the same ID
      if (introChunks.length > 1) {
        const firstId = introChunks[0].id;
        introChunks.forEach((chunk) => {
          expect(chunk.id).toBe(firstId);
        });
      }
    });

    it('should stream custom data parts sent from langgraph stream writer', async () => {
      const graphName = 'test-graph-progressive';
      const threadId = 'thread-progressive';

      // Mock response that simulates progressive JSON streaming
      configureResponses({
        [graphName]: {
          nameProjectNode: [{ projectName: "Progressive Project" }],
          responseNode: [
            {
              intro: 'First part',
              examples: ['item1', 'item2'],
              conclusion: 'Final part',
            },
          ],
        },
      });

      const graph = createSampleGraph(undefined, graphName);

      const stream = createLanggraphUIStream<SampleLanggraphData>({
        graph,
        messages: [new HumanMessage('Test progressive')],
        threadId,
        messageSchema: sampleMessageSchema,
      });

      const chunks: any[] = [];
      for await (const chunk of stream) {
        chunks.push(chunk);
      }

      // Should receive all parts
      const customChunks = chunks.filter((c) => c.type.startsWith(`data-custom-`));

      expect(customChunks).toEqual([
        {
          id: expect.any(String),
          type: "data-custom-notify-task-start",
          data: {
            task: {
              id: expect.any(String),
              title: "Name Project",
            },
          },
        },
        {
          id: expect.any(String),
          type: "data-custom-notify-task-complete",
          data: {
            task: {
              id: expect.any(String),
              title: "Name Project",
            },
          },
        },
        {
          id: expect.any(String),
          type: "data-custom-notify-task-start",
          data: {
            task: {
              id: expect.any(String),
              title: "Generate Response",
            },
          },
        },
        {
          id: expect.any(String),
          type: "data-custom-notify-task-complete",
          data: {
            task: {
              id: expect.any(String),
              title: "Generate Response",
            },
          },
        },
      ]);
    })

  });

  describe('loadThreadHistory', () => {
    it('should return empty state for graph without checkpointer', async () => {
      // This test demonstrates that without a checkpointer,
      // attempting to load history will throw an error
      const graphName = 'test-history';
      const graph = createSampleGraph(undefined, graphName);

      // Without a checkpointer, getState will throw
      await expect(
        loadThreadHistory(graph, 'non-existent-thread', sampleMessageSchema)
      ).rejects.toThrow('No checkpointer set');
    });
  });
});
