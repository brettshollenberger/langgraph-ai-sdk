import { z } from 'zod';
import { parsePartialJson } from 'ai';
import { kebabCase } from 'change-case';
import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  type InferUIMessageChunk,
} from 'ai';
import type { CompiledStateGraph } from '@langchain/langgraph';
import { BaseMessage } from '@langchain/core/messages';
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
import type { 
  LanggraphDataBase,
  LanggraphUIMessage,
  InferState, 
  InferMessage,
  InferMessageSchema,
} from 'langgraph-ai-sdk-types'

type StreamChunk = [
  'messages' | 'updates',
  any
] | [
  [string, string],
  'messages' | 'updates', 
  any
];

export function getSchemaKeys<T extends z.ZodObject<any>>(
  schema: T
): Array<keyof z.infer<T>> {
  return Object.keys(schema.shape) as Array<keyof z.infer<T>>;
}
export interface LanggraphBridgeConfig<
  TGraphData extends LanggraphDataBase<any, any>,
> {
  graph: CompiledStateGraph<InferState<TGraphData>, any>;
  messages: BaseMessage[];
  threadId: string;
  messageSchema?: InferMessageSchema<TGraphData>;
  state?: Partial<InferState<TGraphData>>;
}

export function createLanggraphUIStream<
  TGraphData extends LanggraphDataBase<any, any>,
>({
  graph,
  messages,
  threadId,
  messageSchema,
  state,
}: LanggraphBridgeConfig<TGraphData>) {
  type TState = InferState<TGraphData>
  type TMessage = InferMessage<TGraphData>
  type StateDataParts = Omit<TState, 'messages'>;
    
  return createUIMessageStream<LanggraphUIMessage<TGraphData>>({
    execute: async ({ writer }) => {
      const stream = await graph.stream(
        { messages, ...state },
        { 
          streamMode: ['messages', 'updates', 'custom'],
          context: { graphName: graph.name },
          configurable: { thread_id: threadId }
        }
      );
      
      const stateDataPartIds: Record<string, string> = {};
      const messagePartIds: Record<string, string> = messageSchema ? {} : { text: crypto.randomUUID() };
      let messageBuffer = '';
      
      for await (const chunk of stream) {
        const chunkArray = chunk as StreamChunk;
        let kind: string;
        let data: any;
        
        if (chunkArray.length === 2) {
          [kind, data] = chunkArray;
        } else if (chunkArray.length === 3) {
          [, kind, data] = chunkArray;
        } else {
          continue;
        }
        
        if (kind === 'messages') {
          const [message, metadata] = data;
          
          if (message?.content && metadata?.tags?.includes('notify')) {
            let content = typeof message.content === 'string' 
              ? message.content 
              : '';
            
            messageBuffer += content;

            if (messageSchema) {
              let cleanedBuffer = messageBuffer;
              if (cleanedBuffer.includes('```json')) {
                cleanedBuffer = cleanedBuffer.replace(/```json/g, '').trim();
              }
              if (cleanedBuffer.includes('```')) {
                cleanedBuffer = cleanedBuffer.split('```')[0] as string;
              }
              cleanedBuffer = cleanedBuffer.trim();

              const parseResult = await parsePartialJson(cleanedBuffer);
              const parsed = parseResult.value as Partial<TMessage>;

              if (parsed) {
                Object.entries(parsed).forEach(([key, value]) => {
                  if (value !== undefined) {
                    const partId = messagePartIds[key] || crypto.randomUUID();
                    messagePartIds[key] = partId;
                    
                    const structuredMessagePart = {
                      type: `data-message-${key}`,
                      id: partId,
                      data: value,
                    };
                    writer.write(structuredMessagePart as InferUIMessageChunk<LanggraphUIMessage<TGraphData>>);
                  }
                });
              }
            } else {
              writer.write({
                type: 'data-message-text',
                id: messagePartIds.text,
                data: messageBuffer,
              } as unknown as InferUIMessageChunk<LanggraphUIMessage<TGraphData>>);
            }
          }
        } else if (kind === 'updates') {
          const updates = data as Record<string, any>;
          
          for (const [nodeName, nodeUpdates] of Object.entries(updates)) {
            if (!nodeUpdates || typeof nodeUpdates !== 'object') continue;
            
            (Object.keys(nodeUpdates) as Array<keyof StateDataParts>).forEach((key) => {
              const value = nodeUpdates[key as string];
              if (value === undefined || value === null) return;
              if (key === 'messages') return;
              
              const keyStr = String(key) as Exclude<keyof TState, 'messages'> & string;
              const dataPartId = stateDataPartIds[keyStr] || crypto.randomUUID();
              stateDataPartIds[keyStr] = dataPartId;
              
              writer.write({
                type: `data-state-${keyStr}`,
                id: dataPartId,
                data: value
              } as InferUIMessageChunk<LanggraphUIMessage<TGraphData>>);
            });
          }
        } else if (kind === 'custom') {
          const customData = data as Record<string, any>;
          const defaultKeys = ['id', 'event'];
          const eventName = customData.event;
          if (!eventName || !customData.id) {
            continue;
          }
          const dataKeys = Object.entries(customData).reduce((acc, [key, value]) => {
            if (typeof key === 'string' && !defaultKeys.includes(key)) {
              acc[key] = value;
            }
            return acc;
          }, {} as Record<string, any>);

          writer.write({
            type: kebabCase(`data-custom-${eventName}`),
            id: customData.id,
            data: dataKeys,
          } as InferUIMessageChunk<LanggraphUIMessage<TGraphData>>);
        }
      }
    }
  });
}

export function createLanggraphStreamResponse<
  TGraphData extends LanggraphDataBase<any, any>,
>(
  options: LanggraphBridgeConfig<TGraphData>
): Response {
  const stream = createLanggraphUIStream<TGraphData>(options);
  return createUIMessageStreamResponse({ stream });
}

export async function loadThreadHistory<
  TGraphData extends LanggraphDataBase<any, any>,
>(
  graph: CompiledStateGraph<InferState<TGraphData>, any>,
  threadId: string,
  messageSchema?: InferMessageSchema<TGraphData>
): Promise<{
  messages: LanggraphUIMessage<TGraphData>[];
  state: Partial<InferState<TGraphData>>;
}> {
  type TState = InferState<TGraphData>
  const stateSnapshot = await graph.getState({ configurable: { thread_id: threadId } });
  
  if (!stateSnapshot || !stateSnapshot.values || !('messages' in stateSnapshot.values)) {
    return { messages: [], state: {} };
  }
  
  const messages = (stateSnapshot.values.messages as BaseMessage[]) || [];
  const fullState = stateSnapshot.values;
  const globalState: Partial<TState> = {};
  
  for (const key in fullState) {
    if (key !== 'messages') {
      const value = fullState[key as keyof TState];
      if (value !== undefined && value !== null) {
        (globalState as any)[key] = value;
      }
    }
  }
  
  const uiMessages = messages.map((msg, idx) => {
    const isUser = msg._getType() === 'human';
    const content = typeof msg.content === 'string' ? msg.content : '';
    const parts = [];
    
    if (isUser) {
      parts.push({
        type: 'text',
        id: crypto.randomUUID(),
        text: content
      });
    } else if (messageSchema) {
      Object.entries(msg.response_metadata).forEach(([key, value]) => {
        parts.push({
          type: `data-message-${key}`,
          id: crypto.randomUUID(),
          data: value
        });
      });
    } else {
      parts.push({
        type: 'data-message-text',
        id: crypto.randomUUID(),
        data: content
      });
    }
    
    return {
      id: `msg-${idx}`,
      role: isUser ? 'user' : 'assistant',
      parts
    } as LanggraphUIMessage<TGraphData>;
  });
  
  return { messages: uiMessages, state: globalState };
}
