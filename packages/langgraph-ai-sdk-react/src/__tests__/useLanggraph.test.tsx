import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useLanggraph } from '../useLanggraph';
import type { LanggraphDataBase } from '@langgraph-ai-sdk/types';

// Define test types matching the sample graph
type TestState = {
  messages: any[];
  projectName?: string;
};

type TestMessage = {
  intro: string;
  examples: string[];
  conclusion: string;
} | {
  content: string;
};

type TestLanggraphData = LanggraphDataBase<TestState, TestMessage>;

describe('useLanggraph', () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    global.fetch = mockFetch;
    mockFetch.mockClear();
  });

  describe('History Loading', () => {
    it('should load history on mount', async () => {
      const mockHistory = {
        messages: [
          {
            id: 'msg-1',
            role: 'user',
            parts: [{ type: 'text', id: 'part-1', text: 'Hello' }],
          },
          {
            id: 'msg-2',
            role: 'assistant',
            parts: [
              { type: 'data-message-intro', id: 'part-2', data: 'Hi there' },
              { type: 'data-message-examples', id: 'part-3', data: ['ex1'] },
              { type: 'data-message-conclusion', id: 'part-4', data: 'Done' },
            ],
          },
        ],
        state: { projectName: 'Test Project' },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockHistory,
      });

      const { result } = renderHook(() =>
        useLanggraph<TestLanggraphData>({
          api: '/api/chat',
          getInitialThreadId: () => 'test-thread-123',
        })
      );

      // Initially loading
      expect(result.current.isLoadingHistory).toBe(true);

      // Wait for history to load
      await waitFor(() => {
        expect(result.current.isLoadingHistory).toBe(false);
      });

      // Should have loaded messages
      await waitFor(() => {
        expect(result.current.messages.length).toBe(2);
      });

      // Should have loaded state
      await waitFor(() => {
        expect(result.current.state.projectName).toBe('Test Project');
      });
    });

    it('should handle empty history', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ messages: [], state: {} }),
      });

      const { result } = renderHook(() =>
        useLanggraph<TestLanggraphData>({
          getInitialThreadId: () => 'test-thread-456',
        })
      );

      await waitFor(() => {
        expect(result.current.isLoadingHistory).toBe(false);
      });

      expect(result.current.messages).toEqual([]);
      expect(result.current.state).toEqual({});
    });

    it('should handle fetch errors gracefully', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const { result } = renderHook(() =>
        useLanggraph<TestLanggraphData>({
          getInitialThreadId: () => 'test-thread-789',
        })
      );

      await waitFor(() => {
        expect(result.current.isLoadingHistory).toBe(false);
      });

      // Should not crash, just have empty state
      expect(result.current.messages).toEqual([]);
    });
  });

  describe('Message Format Transformation', () => {
    it('should transform structured message parts correctly', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          messages: [
            {
              id: 'msg-1',
              role: 'assistant',
              parts: [
                { type: 'data-message-intro', id: 'part-1', data: 'Introduction' },
                { type: 'data-message-examples', id: 'part-2', data: ['a', 'b', 'c'] },
                { type: 'data-message-conclusion', id: 'part-3', data: 'Conclusion' },
              ],
            },
          ],
          state: {},
        }),
      });

      const { result } = renderHook(() =>
        useLanggraph<TestLanggraphData>({
          getInitialThreadId: () => 'test-thread-structured',
        })
      );

      await waitFor(() => {
        expect(result.current.isLoadingHistory).toBe(false);
      });

      await waitFor(() => {
        expect(result.current.messages.length).toBe(1);
      });

      const message = result.current.messages[0];
      expect(message.role).toBe('assistant');
      expect(message.parts).toHaveLength(3);

      // Check intro part
      const introPart = message.parts.find((p: any) => p.type === 'intro');
      expect(introPart).toBeDefined();
      expect(introPart?.data).toBe('Introduction');

      // Check examples part
      const examplesPart = message.parts.find((p: any) => p.type === 'examples');
      expect(examplesPart).toBeDefined();
      expect(examplesPart?.data).toEqual(['a', 'b', 'c']);

      // Check conclusion part
      const conclusionPart = message.parts.find((p: any) => p.type === 'conclusion');
      expect(conclusionPart).toBeDefined();
      expect(conclusionPart?.data).toBe('Conclusion');
    });

    it('should handle simple text messages', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          messages: [
            {
              id: 'msg-1',
              role: 'assistant',
              parts: [
                { type: 'data-message-text', id: 'part-1', data: 'Simple text response' },
              ],
            },
          ],
          state: {},
        }),
      });

      const { result } = renderHook(() =>
        useLanggraph<TestLanggraphData>({
          getInitialThreadId: () => 'test-thread-simple',
        })
      );

      await waitFor(() => {
        expect(result.current.isLoadingHistory).toBe(false);
      });

      await waitFor(() => {
        expect(result.current.messages.length).toBe(1);
      });

      const message = result.current.messages[0];
      expect(message.parts).toHaveLength(1);
      expect(message.parts[0].type).toBe('text');
      expect((message.parts[0] as any).text).toBe('Simple text response');
    });

    it('should handle user messages', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          messages: [
            {
              id: 'msg-1',
              role: 'user',
              parts: [{ type: 'text', id: 'part-1', text: 'User question' }],
            },
          ],
          state: {},
        }),
      });

      const { result } = renderHook(() =>
        useLanggraph<TestLanggraphData>({
          getInitialThreadId: () => 'test-thread-user',
        })
      );

      await waitFor(() => {
        expect(result.current.isLoadingHistory).toBe(false);
      });

      await waitFor(() => {
        expect(result.current.messages.length).toBe(1);
      });

      const message = result.current.messages[0];
      expect(message.role).toBe('user');
      expect(message.parts).toHaveLength(1);
      expect(message.parts[0].type).toBe('text');
      expect((message.parts[0] as any).text).toBe('User question');
    });
  });

  describe('State Extraction', () => {
    it('should extract state from data-state-* parts in latest AI message', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          messages: [
            {
              id: 'msg-1',
              role: 'assistant',
              parts: [
                { type: 'data-state-projectName', id: 'state-1', data: 'New Project' },
                { type: 'data-message-intro', id: 'msg-1', data: 'Hello' },
              ],
            },
          ],
          state: { projectName: 'Old Project' },
        }),
      });

      const { result } = renderHook(() =>
        useLanggraph<TestLanggraphData>({
          getInitialThreadId: () => 'test-thread-state',
        })
      );

      await waitFor(() => {
        expect(result.current.isLoadingHistory).toBe(false);
      });

      // Latest message state should override server state
      await waitFor(() => {
        expect(result.current.state.projectName).toBe('New Project');
      });
    });

    it('should merge multiple state updates from latest message', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          messages: [
            {
              id: 'msg-1',
              role: 'assistant',
              parts: [
                { type: 'data-state-projectName', id: 'state-1', data: 'Project A' },
                { type: 'data-message-intro', id: 'msg-1', data: 'Response' },
              ],
            },
          ],
          state: {},
        }),
      });

      const { result } = renderHook(() =>
        useLanggraph<TestLanggraphData>({
          getInitialThreadId: () => 'test-thread-merge',
        })
      );

      await waitFor(() => {
        expect(result.current.isLoadingHistory).toBe(false);
      });

      await waitFor(() => {
        expect(result.current.state.projectName).toBe('Project A');
      });
    });

    it('should use server state when no AI messages have state updates', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          messages: [
            {
              id: 'msg-1',
              role: 'user',
              parts: [{ type: 'text', id: 'part-1', text: 'Hello' }],
            },
          ],
          state: { projectName: 'Server Project' },
        }),
      });

      const { result } = renderHook(() =>
        useLanggraph<TestLanggraphData>({
          getInitialThreadId: () => 'test-thread-server',
        })
      );

      await waitFor(() => {
        expect(result.current.isLoadingHistory).toBe(false);
      });

      await waitFor(() => {
        expect(result.current.state.projectName).toBe('Server Project');
      });
    });
  });

  describe('ThreadId Exposure', () => {
    it('should not expose threadId before first submission', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ messages: [], state: {} }),
      });

      const { result } = renderHook(() =>
        useLanggraph<TestLanggraphData>({
          getInitialThreadId: () => 'test-thread-hidden',
        })
      );

      await waitFor(() => {
        expect(result.current.isLoadingHistory).toBe(false);
      });

      expect(result.current.threadId).toBeUndefined();
    });

    it('should expose threadId after sendMessage is called', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ messages: [], state: {} }),
      });

      const { result } = renderHook(() =>
        useLanggraph<TestLanggraphData>({
          getInitialThreadId: () => 'test-thread-exposed',
        })
      );

      await waitFor(() => {
        expect(result.current.isLoadingHistory).toBe(false);
      });

      expect(result.current.threadId).toBeUndefined();

      // Send a message
      act(() => {
        result.current.sendMessage('Hello');
      });

      // ThreadId should now be exposed
      expect(result.current.threadId).toBe('test-thread-exposed');
    });
  });

  describe('Error Handling', () => {
    it('should set error state when API returns error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ messages: [], state: {} }),
      });

      const { result } = renderHook(() =>
        useLanggraph<TestLanggraphData>({
          getInitialThreadId: () => 'test-thread-error',
        })
      );

      await waitFor(() => {
        expect(result.current.isLoadingHistory).toBe(false);
      });

      expect(result.current.error).toBeNull();
    });
  });
});
