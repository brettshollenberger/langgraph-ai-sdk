import { z } from 'zod';
import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  type InferUIMessageChunk,
  type UIMessage,
} from 'ai';
import type { CompiledStateGraph } from '@langchain/langgraph';
import { BaseMessage, AIMessage } from '@langchain/core/messages';
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
import type { LanggraphData } from './types.ts'
import type { 
  LanggraphDataBase,
  LanggraphUIMessage,
  InferState, 
  InferMessage, 
  StructuredMessage 
} from '@langgraph-ai-sdk/types'

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
  checkpointer?: PostgresSaver;
  state?: Partial<InferState<TGraphData>>;
}

export function createLanggraphUIStream<
  TGraphData extends LanggraphDataBase<any, any>,
>({
  graph,
  messages,
  threadId,
  state,
}: LanggraphBridgeConfig<TGraphData>) {
  type TState = InferState<TGraphData>
  type TMessage = InferMessage<TGraphData>
  type StateDataParts = Omit<TState, 'messages'>;
  type TStructuredMessage = TMessage extends StructuredMessage ? TMessage : never;
  // type DataPartsType = TMessage extends StructuredMessage ? TState & TStructuredMessage : TState;
    
  return createUIMessageStream<LanggraphUIMessage<TGraphData>>({
  // return createUIMessageStream<UIMessage<unknown, { 'message-text': string }>>({
    execute: async ({ writer }) => {
      const stream = await graph.stream(
        { messages, ...state },
        { 
          streamMode: ['messages', 'updates'],
          configurable: { thread_id: threadId }
        }
      );
      
      const stateDataPartIds: Record<string, string> = {};
      const messagePartId = crypto.randomUUID();
      const textId = crypto.randomUUID();
      let messageBuffer = '';
      let isFirstTextChunk = true;
      
      for await (const chunk of stream) {
        const chunkArray = chunk as StreamChunk;
        let kind: string;
        let data: any;
        console.log(chunkArray);
        
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
            
            // let cleanedBuffer = jsonBuffer;
            // if (cleanedBuffer.includes('```json')) {
            //   cleanedBuffer = cleanedBuffer.replace(/```json/g, '').trim();
            // }
            // if (cleanedBuffer.includes('```')) {
            //   cleanedBuffer = cleanedBuffer.split('```')[0] as string;
            // }
            // cleanedBuffer = cleanedBuffer.trim();
            
            if (typeof message.content === 'string') {
              // Schema provided: stream raw JSON chunks for progressive parsing on frontend
              if (content) {
                writer.write({
                  type: 'data-message-text',
                  id: messagePartId,
                  data: messageBuffer,
                });
              }
            } else {
              // No schema: stream as plain text
              if (content) {
                if (isFirstTextChunk) {
                  isFirstTextChunk = false;
                  writer.write({ type: 'text-start', id: textId });
                }
                
                writer.write({
                  type: 'text-delta',
                  id: textId,
                  delta: content
                });
              }
            }
          }
        } else if (kind === 'updates') {
          const updates = data as Record<string, any>;
          
          for (const [nodeName, nodeUpdates] of Object.entries(updates)) {
            if (!nodeUpdates || typeof nodeUpdates !== 'object') continue;
            
            (Object.keys(nodeUpdates) as Array<keyof StateDataParts>).forEach((key) => {
              const value = nodeUpdates[key as string];
              if (value === undefined || value === null) return;
              
              const keyStr = String(key) as Exclude<keyof TState, 'messages'> & string;
              const dataPartId = stateDataPartIds[keyStr] || crypto.randomUUID();
              stateDataPartIds[keyStr] = dataPartId;
              
              writer.write({
                type: `data-${keyStr}`,
                id: dataPartId,
                data: value
              } as InferUIMessageChunk<LanggraphUIMessage<TGraphData>>);
            });
            
          }
        }
      }
      
      // End text stream if no schema was provided
      if (!messageMetadataSchema && !isFirstTextChunk) {
        writer.write({ type: 'text-end', id: textId });
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
  // messageMetadataSchema?: TMessageMetadataSchema
): Promise<{
  messages: LanggraphUIMessage<TGraphData>[];
  state: Partial<InferState<TGraphData>>;
}> {
  type TState = InferState<TGraphData>
  type TMessage = InferMessage<TGraphData>
  type DataPartsType = TState & TMessage;
  
  const stateSnapshot = await graph.getState({ configurable: { thread_id: threadId } });
  
  if (!stateSnapshot || !stateSnapshot.values || !('messages' in stateSnapshot.values)) {
    return { messages: [], state: {} };
  }
  
  const messages = (stateSnapshot.values.messages as BaseMessage[]) || [];
  const fullState = stateSnapshot.values as TState;
  
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
    
    const parts: any[] = [
      { type: 'text', text: content }
    ];
    
    // Else type would be string... in which case do we send as string?
    if (msg instanceof AIMessage && msg.response_metadata && typeof msg.response_metadata === 'object') {
      parts.push({
        type: 'data-metadata',
        id: crypto.randomUUID(),
        data: JSON.stringify(msg.response_metadata)
      });
    }
    
    return {
      id: `msg-${idx}`,
      role: isUser ? 'user' : 'assistant',
      parts
    } as UIMessage<never, DataPartsType>;
  });

  return { messages: uiMessages, state: globalState };
}
