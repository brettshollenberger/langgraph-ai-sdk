import { useRef, useEffectEvent } from 'react';
import { useChat } from '@ai-sdk/react';
import { useState, useEffect, useMemo } from 'react';
import type { 
  LanggraphDataBase, 
  InferState, 
  InferMessage, 
  InferMessageSchema, 
  LanggraphAISDKUIMessage,
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

  const chat = useChat<LanggraphAISDKUIMessage<TLanggraphData>>({
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

  const messages: LanggraphUIMessage<TLanggraphData>[] = useMemo(() => {
    return chat.messages.map(msg => {
      if (msg.role !== 'assistant') {
        const textPart = msg.parts.find(p => p.type === 'text');
        const text = textPart && 'text' in textPart ? textPart.text : '';
        
        return {
          id: msg.id,
          role: msg.role,
          type: 'text',
          text
        } as LanggraphUIMessage<TLanggraphData>;
      }

      // Handle text-only assistant messages
      const textParts = msg.parts.filter(p => p.type === 'data-message-text');
      const otherParts = msg.parts.filter(p => p.type !== 'data-message-text' && p.type.startsWith('data-message-'));
      if (textParts.length > 0 && otherParts.length === 0) {
        const text = textParts.map(p => (p as any).data).join('');
        
        return {
          id: msg.id,
          role: msg.role,
          type: 'text',
          text
        } as LanggraphUIMessage<TLanggraphData>;
      }

      const messageParts = msg.parts
        .filter(p => typeof p.type === 'string' && p.type.startsWith('data-message-'))
        .map(p => ({
          type: p.type,
          data: (p as any).data,
          id: (p as any).id
        }));

      const userSpecifiedOutputType = messageParts.reduce((acc, part) => {
        if (typeof part.type !== 'string') {
          return acc;
        }
        const key = part.type.replace('data-message-', '')
        const value = part.data
        acc[key as keyof TMessage] = value
        return acc;
      }, {} as Record<keyof TMessage, string>);

      // Determine the message type from the structured data
      const messageType = messageParts.length > 0 
        ? messageParts[0].type.replace('data-message-', '')
        : 'structured';
      const state = Object.keys(userSpecifiedOutputType).filter((k) => k !== "type").length > 0 ? "streaming" : "thinking";

      return {
        id: msg.id,
        state,
        role: msg.role,
        type: messageType,
        ...userSpecifiedOutputType
      } as LanggraphUIMessage<TLanggraphData>
    }) as LanggraphUIMessage<TLanggraphData>[];
  }, [chat.messages]);

  const tools = useMemo(() => {
    const lastAIMessage = chat.messages.filter(m => m.role === 'assistant').at(-1);
    if (!lastAIMessage) return [];
    return lastAIMessage
        .parts
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
            toolName: toolCall.type.replace('tool-', ''),
            input: toolCall.input,
            output,
            state,
            error: toolCall.errorText,
            id: toolCall.id || crypto.randomUUID()
          };
        });
  }, [chat.messages]);

  return {
    ...chat,
    sendMessage,
    messages,
    state,
    tools,
    events: customEvents,
    threadId: hasSubmitted ? threadId : undefined,
    error,
    isLoadingHistory,
  };
}
