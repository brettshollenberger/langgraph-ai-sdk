import { z } from 'zod';
import { useRef, useEffectEvent } from 'react';
import { useChat } from '@ai-sdk/react';
import { useState, useEffect, useMemo } from 'react';
import type { 
  LanggraphDataBase, 
  InferState, 
  InferMessage, 
  InferMessageSchema, 
  LanggraphAISDKUIMessage,
  LanggraphMessage 
} from '@langgraph-ai-sdk/types';
import { DefaultChatTransport } from 'ai';
import { v7 as uuidv7 } from 'uuid';

export function useLanggraph<
  TLanggraphData extends LanggraphDataBase<any, any>
>({
  api = '/api/chat',
  headers = {},
  getInitialThreadId,
  messageSchema,
}: {
  api?: string;
  headers?: Record<string, string>;
  getInitialThreadId?: () => string | undefined;
  messageSchema?: z.ZodSchema;
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
        console.log('[useLanggraph] Received history:', data);
        if (data.messages && data.messages.length > 0) {
          console.log('[useLanggraph] Setting', data.messages.length, 'messages');
          chat.setMessages(data.messages);
        }
        if (data.state) {
          console.log('[useLanggraph] Setting state:', data.state);
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

  const messages: LanggraphMessage<TLanggraphData>[] = useMemo(() => {
    return chat.messages.map(msg => {
      if (msg.role !== 'assistant') {
        return {
          id: msg.id,
          role: msg.role,
          type: 'simple',
          text: msg.parts.at(0)?.text!,
        } satisfies LanggraphMessage<TLanggraphData>;
      }

      if (!messageSchema) {
        const textParts = msg.parts.filter(p => p.type === 'data-message-text');
        if (textParts.length > 0) {
          return {
            id: msg.id,
            role: 'assistant',
            type: 'simple',
            text: textParts.at(0)?.text!,
          } satisfies LanggraphMessage<TLanggraphData>; // TODO: Why can't we infer type: simple when data-message-text is present?
        }
      }

      const structuredMessage = msg.parts
        .filter(p => p.type.startsWith('data-message-'))
        .reduce((builtObject, currentPart) => {
          const key = currentPart.type.replace('data-message-', '') as keyof TMessage;
          
          builtObject[key] = (currentPart as any).data;
          
          return builtObject;
        }, {} as Partial<TMessage>);

      return {
        id: msg.id,
        role: 'assistant' as const,
        type: 'structured' as const,
        data: structuredMessage,
      } satisfies LanggraphMessage<TLanggraphData>;
    });
  }, [chat.messages]);
  console.log(chat.messages);

  return {
    ...chat,
    sendMessage,
    messages,
    state,
    threadId: hasSubmitted ? threadId : undefined,
    error,
    isLoadingHistory,
  };
}
