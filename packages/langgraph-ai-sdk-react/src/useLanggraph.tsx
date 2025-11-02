import { useRef, useEffectEvent } from 'react';
import { useChat } from '@ai-sdk/react';
import { useState, useEffect, useMemo } from 'react';
import type { LanggraphDataBase, InferState, InferMessage, LanggraphUIMessage } from '@langgraph-ai-sdk/types';
import { DefaultChatTransport } from 'ai';
import { parsePartialJson } from 'ai';
import { v7 as uuidv7 } from 'uuid';

export function useLanggraph<
  TLanggraphData extends LanggraphDataBase<any, any>
>({
  api = '/api/chat',
  headers = {},
  // stateFields,
  // messageSchema,
  getInitialThreadId,
}: {
  api?: string;
  headers?: Record<string, string>;
  // stateFields: Array<keyof TState>;
  // messageSchema: z.ZodObject<any> & {
  //   _output: TMessageMetadata
  // };
  getInitialThreadId?: () => string | undefined;
}) {
  type TState = InferState<TLanggraphData>
  type TMessage = InferMessage<TLanggraphData>

  const threadIdRef = useRef<string>(getInitialThreadId?.() ?? uuidv7());
  const threadId = threadIdRef.current;
  const [error, setError] = useState<string | null>(null);
  const [serverState, setServerState] = useState<TState>({} as TState);
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
          console.log(`here it is! State!!!`, data.state);
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

  const derivedState = useMemo(() => {
    const stateObj: Partial<TState> = {};
    const latestAI = chat.messages.filter(m => m.role === 'assistant').at(-1);
    
    if (latestAI) {
      stateFields.forEach((field) => {
        const part = latestAI.parts.find(p => p.type === `data-${String(field)}`);
        if (part && 'data' in part) {
          stateObj[field] = part.data as TState[keyof TState];
        }
      });
    }
    
    return stateObj;
  }, [chat.messages, stateFields]);

  const state = Object.keys(derivedState).length > 0 ? derivedState : serverState;

  const [messageStream, setMessageStream] = useState<FrontendMessage<TMessageMetadata>[]>([]);

  useEffect(() => {
    const transformMessages = async () => {
      const transformed = await Promise.all(
        chat.messages.map(async (msg) => {
          const results: FrontendMessagePart<TMessageMetadata>[] = [];
          
          for (const part of msg.parts) {
            if (part.type === 'text') {
              results.push({ type: 'text', text: part.text });
            } else if (part.type === 'data-metadata') {
              try {
                let cleanedData = part.data;
                if (cleanedData.includes('```json')) {
                  cleanedData = cleanedData.replace(/```json/g, '').trim();
                }
                if (cleanedData.includes('```')) {
                  cleanedData = cleanedData.split('```')[0] as string;
                }
                cleanedData = cleanedData.trim();
                
                const parsed = await parsePartialJson(cleanedData);
                const metadata = parsed?.value || parsed;
                
                if (metadata && typeof metadata === 'object') {
                  for (const [key, value] of Object.entries(metadata)) {
                    if (key in messageSchema.shape) {
                      results.push({
                        type: key as keyof TMessageMetadata,
                        id: crypto.randomUUID(),
                        data: value as any,
                      } as FrontendMessagePart<TMessageMetadata>);
                    }
                  }
                }
              } catch {
                // Partial JSON not ready yet, skip
              }
            }
          }
          
          return {
            ...msg,
            parts: results,
          };
        })
      );
      
      setMessageStream(transformed);
    };
    
    transformMessages();
  }, [chat.messages, messageSchema]);

  return {
    ...chat,
    sendMessage,
    messages: messageStream,
    state,
    threadId: hasSubmitted ? threadId : undefined,
    error,
    isLoadingHistory,
  };
}