import { useRef, useEffectEvent } from 'react';
import { useChat } from '@ai-sdk/react';
import { useState, useEffect, useMemo } from 'react';
import type {
  LanggraphData,
  InferState,
  InferMessage,
  LanggraphAISDKUIMessage,
  LanggraphUIMessage,
  SimpleLanggraphUIMessage,
  _SimpleLanggraphUIMessage,
  MessageWithBlocks,
  MessageBlock,
  TextMessageBlock,
  StructuredMessageBlock,
  ReasoningMessageBlock,
  ToolCallMessageBlock,
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
  TLanggraphData extends LanggraphData<any, any>
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

  const initialThreadVal = getInitialThreadId?.();
  const threadIdRef = useRef<string>(initialThreadVal ?? uuidv7());
  const threadId = threadIdRef.current;
  const [error, setError] = useState<string | null>(null);
  const [serverState, setServerState] = useState<Partial<TState>>({});
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const headersRef = useRef(headers);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const isNewThread = useRef(!initialThreadVal);

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

  const sendMessage = (
    message: string | Parameters<typeof chat.sendMessage>[0],
    additionalState?: Partial<TState>
  ) => {
    if (!hasSubmitted) {
      setHasSubmitted(true);
    }

    const options = additionalState
      ? { body: { state: additionalState } }
      : undefined;

    // Convert string to { text: string } format
    const messageParam = typeof message === 'string'
      ? { text: message }
      : message;

    chat.sendMessage(messageParam, options as any);
  };

  const loadHistory = useEffectEvent(async () => {
    if (isNewThread.current) { // If it is a new thread, don't load history
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

  const messages: MessageWithBlocks<TLanggraphData>[] = useMemo(() => {
    return chat.messages.map(msg => {
      if (msg.role === 'user') {
        const textPart = msg.parts.find(p => p.type === 'text');
        const text = textPart && 'text' in textPart ? textPart.text : '';
        
        return {
          id: msg.id,
          role: msg.role,
          blocks: [{
            type: 'text' as const,
            index: 0,
            text,
            id: crypto.randomUUID(),
          }]
        };
      }
      
      const blocksByIndex = new Map<number, any[]>();
      
      msg.parts.forEach(part => {
        if (part.type.startsWith('data-content-block-')) {
          const index = (part as any).data?.index ?? 0;
          if (!blocksByIndex.has(index)) {
            blocksByIndex.set(index, []);
          }
          blocksByIndex.get(index)!.push(part);
        } else if (part.type.startsWith('tool-')) {
          const index = (part as any).data?.index ?? 0;
          if (!blocksByIndex.has(index)) {
            blocksByIndex.set(index, []);
          }
          blocksByIndex.get(index)!.push(part);
        }
      });
      
      const blocks = Array.from(blocksByIndex.entries())
        .sort((a, b) => a[0] - b[0])
        .flatMap(([index, parts]) => {
          return parts.map(part => convertPartToBlock(part, index));
        });
      
      return {
        id: msg.id,
        role: msg.role,
        blocks,
      } 
    }) as MessageWithBlocks<TLanggraphData>[];
  }, [chat.messages]);

  function convertPartToBlock(part: any, index: number): MessageBlock<TLanggraphData> {
    if (part.type === 'data-content-block-text') {
      return {
        type: 'text',
        index,
        text: part.data.text as string,
        id: part.id as string,
      } as MessageBlock<TLanggraphData>;
    } else if (part.type === 'data-content-block-structured') {
      return {
        type: 'structured',
        index,
        data: part.data.data,
        sourceText: part.data.sourceText,
        id: part.id,
      } as MessageBlock<TLanggraphData>;
    } else if (part.type === 'data-content-block-reasoning') {
      return {
        type: 'reasoning',
        index,
        text: part.data.text,
        id: part.id,
      } as MessageBlock<TLanggraphData>;
    } else if (part.type.startsWith('tool-')) {
      return {
        type: 'tool_call',
        index,
        toolCallId: part.data?.toolCallId || part.toolCallId,
        toolName: part.type.replace('tool-', ''),
        input: part.data?.input || part.input,
        output: part.data?.output || part.output,
        state: (part.data?.errorText || part.errorText) ? 'error' : ((part.data?.output || part.output) ? 'complete' : 'running'),
        errorText: part.data?.errorText || part.errorText,
        id: part.id || crypto.randomUUID(),
      } as MessageBlock<TLanggraphData>;
    }
    
    return {
      type: 'text',
      index: 0,
      text: JSON.stringify(part),
      id: crypto.randomUUID(),
    } as MessageBlock<TLanggraphData>;
  }

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
