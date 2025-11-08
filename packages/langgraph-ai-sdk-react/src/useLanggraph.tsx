import { useRef, useEffectEvent } from 'react';
import { useChat } from '@ai-sdk/react';
import { useState, useEffect, useMemo } from 'react';
import type { 
  LanggraphDataBase, 
  InferState, 
  InferMessage, 
  InferMessageSchema, 
  LanggraphUIMessage,
  LanggraphMessage 
} from 'langgraph-ai-sdk-types';
import { DefaultChatTransport } from 'ai';
import { v7 as uuidv7 } from 'uuid';

interface CustomEvent {
  id: string;
  type: string;
  data: any;
}

interface ToolCall {
  id?: string;
  type: string;
  errorText?: string;
  input: Record<string, any>;
  output?: Record<string, any>;
  state: Record<string, any>;
  toolCallId: string;
}

export function useLanggraph<
  TLanggraphData extends LanggraphDataBase<any, any>
>({
  api = '/api/chat',
  headers = {},
  getInitialThreadId,
}: {
  api?: string;
  headers?: Record<string, string>;
  getInitialThreadId?: () => string | undefined;
}) {
  type TState = InferState<TLanggraphData>
  type TMessage = InferMessage<TLanggraphData>

  const threadIdRef = useRef<string>(getInitialThreadId?.() ?? uuidv7());
  const threadId = threadIdRef.current;
  const [error, setError] = useState<string | null>(null);
  const [serverState, setServerState] = useState<Partial<TState>>({});
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const headersRef = useRef(headers);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);

  const chat = useChat<LanggraphUIMessage<TLanggraphData>>({
    transport: new DefaultChatTransport({
      api,
      headers,
      body: { threadId },
    }),
    onError: (error: Error) => {
      setError(error.message);
    },
  });

  const sendMessage = (...args: Parameters<typeof chat.sendMessage>) => {
    if (!hasSubmitted) {
      setHasSubmitted(true);
    }

    chat.sendMessage(...args);
  };

  const loadHistory = useEffectEvent(async () => {
    if (!threadId) {
      setIsLoadingHistory(false);
      return;
    }

    try {
      const response = await fetch(`${api}?threadId=${threadId}`, {
        headers: headersRef.current,
      });
      if (response.ok) {
        const data = await response.json();
        if (data.messages && data.messages.length > 0) {
          chat.setMessages(data.messages);
        }
        if (data.state) {
          setServerState(data.state);
        }
      }
    } catch (error) {
      console.error('Failed to load history:', error);
    } finally {
      setIsLoadingHistory(false);
    }
  });

  useEffect(() => {
    loadHistory();
  }, [threadId, api]);

  const state = useMemo(() => {
    const latestAI = chat.messages.filter(m => m.role === 'assistant').at(-1);
    
    if (latestAI) {
      const newState: Partial<TState> = { ...serverState };
      
      for (const part of latestAI.parts) {
        if (part.type.startsWith('data-state-')) {
          const key = part.type.replace('data-state-', '') as keyof TState;
          if ('data' in part) {
            newState[key] = part.data as TState[keyof TState];
          }
        }
      }
      
      return newState;
    }
    
    return serverState;
  }, [chat.messages, serverState]);

  const customEvents = useMemo(() => {
    const latestAI = chat.messages.filter(m => m.role === 'assistant').at(-1);
    
    if (latestAI) {
      const newEvents: CustomEvent[] = [];
      
      for (const part of latestAI.parts) {
        if (part.type.startsWith('data-custom-')) {
          const key = part.type.replace('data-custom-', '') as keyof TState;
          if ('data' in part && 'id' in part && 'type' in part && typeof part.id === 'string' && typeof key === 'string' && typeof part.data === 'object') {
            newEvents.push({
              id: part.id,
              type: key,
              data: part.data as TState[keyof TState]
            });
          }
        }
      }
      
      return newEvents;
    }
    return [];
  }, [chat.messages]);

  const messages: LanggraphMessage<TLanggraphData>[] = useMemo(() => {
    return chat.messages.map(msg => {
      if (msg.role !== 'assistant') {
        return {
          id: msg.id,
          role: msg.role,
          parts: msg.parts
            .filter(p => p.type === 'text')
            .map(p => ({
              type: 'text' as const,
              text: (p as any).text,
              id: (p as any).id || crypto.randomUUID()
            }))
        } as LanggraphMessage<TLanggraphData>;
      }

      // Good: type: text, data: string, id: string
      const textParts = msg.parts.filter(p => p.type === 'data-message-text');
      const otherParts = msg.parts.filter(p => p.type !== 'data-message-text' && p.type.startsWith('data-message-'));
      if (textParts.length > 0 && otherParts.length === 0) {
        return {
          id: msg.id,
          role: msg.role,
          parts: textParts.map(p => ({
            type: 'text' as const,
            data: (p as any).data,
            id: (p as any).id
          })).concat([{
            type: 'type',
            data: 'text',
            id: crypto.randomUUID()
          }])
        } as LanggraphMessage<TLanggraphData>;
      }

      // Fail: array of parts of type text, data: string, id: string
      const messageParts = msg.parts
        .filter(p => p.type.startsWith('data-message-'))
        .map(p => ({
          type: p.type.replace('data-message-', '') as keyof TMessage,
          data: (p as any).data,
          id: (p as any).id
        }));

      const toolParts = msg.parts
        .filter(p => p.type.startsWith('tool-'))
        .map((p) => {
          const toolCall = p as ToolCall;
          const toolCallId = toolCall.toolCallId;
          
          const output = toolCall.output
          const isError = toolCall.errorText !== undefined
          const state = isError ? 'error' : (output ? 'complete' : 'running')

          return {
            type: 'tool' as const,
            toolCallId,
            toolName: toolCall.type,
            input: toolCall.input,
            output,
            state,
            error: toolCall.errorText,
            id: toolCall.id || crypto.randomUUID()
          };
        });

      return {
        id: msg.id,
        role: msg.role,
        parts: [...messageParts, ...toolParts]
      } as LanggraphMessage<TLanggraphData>;
    });
  }, [chat.messages]);

  return {
    ...chat,
    sendMessage,
    messages,
    state,
    events: customEvents,
    threadId: hasSubmitted ? threadId : undefined,
    error,
    isLoadingHistory,
  };
}
