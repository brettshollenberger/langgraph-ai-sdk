import { z } from 'zod';
import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  type UIMessage,
} from 'ai';
import type { CompiledStateGraph } from '@langchain/langgraph';
import { BaseMessage, AIMessage } from '@langchain/core/messages';
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';

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

export interface LangGraphBridgeConfig<
  TState extends { messages: BaseMessage[] },
  TMessageMetadataSchema extends z.ZodObject<any> | undefined = undefined
> {
  graph: CompiledStateGraph<TState, any>;
  messages: BaseMessage[];
  messageMetadataSchema?: TMessageMetadataSchema;
  threadId: string;
  checkpointer?: PostgresSaver;
}

export function createLangGraphUIStream<
  TState extends { messages: BaseMessage[] },
  TMessageMetadataSchema extends z.ZodObject<any> | undefined = undefined
>({
  graph,
  messages,
  messageMetadataSchema,
  threadId,
}: LangGraphBridgeConfig<TState, TMessageMetadataSchema>) {
  type StateDataParts = Omit<TState, 'messages'>;
  type MessageMetadataParts = TMessageMetadataSchema extends z.ZodObject<any> 
    ? z.infer<TMessageMetadataSchema> 
    : Record<never, never>;
  type DataPartsType = StateDataParts & MessageMetadataParts;
  
  return createUIMessageStream<UIMessage<never, DataPartsType>>({
    execute: async ({ writer }) => {
      const stream = await graph.stream(
        { messages } as Partial<TState>,
        { 
          streamMode: ['messages', 'updates'],
          configurable: { thread_id: threadId }
        }
      );
      
      const stateDataPartIds: Record<string, string> = {};
      const metadataPartId = crypto.randomUUID();
      const textId = crypto.randomUUID();
      let jsonBuffer = '';
      let isFirstTextChunk = true;
      
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
            
            jsonBuffer += content;
            
            let cleanedBuffer = jsonBuffer;
            if (cleanedBuffer.includes('```json')) {
              cleanedBuffer = cleanedBuffer.replace(/```json/g, '').trim();
            }
            if (cleanedBuffer.includes('```')) {
              cleanedBuffer = cleanedBuffer.split('```')[0] as string;
            }
            cleanedBuffer = cleanedBuffer.trim();
            
            if (messageMetadataSchema) {
              // Schema provided: stream raw JSON chunks for progressive parsing on frontend
              if (content) {
                writer.write({
                  type: 'data-metadata',
                  id: metadataPartId,
                  data: jsonBuffer,
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
              });
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

export function createLangGraphStreamResponse<
  TState extends { messages: BaseMessage[] },
  TMessageMetadataSchema extends z.ZodObject<any> | undefined = undefined
>(
  options: LangGraphBridgeConfig<TState, TMessageMetadataSchema>
): Response {
  const stream = createLangGraphUIStream(options);
  return createUIMessageStreamResponse({ stream });
}

export async function loadThreadHistory<
  TState extends { messages: BaseMessage[] },
  TMessageMetadataSchema extends z.ZodObject<any> | undefined = undefined
>(
  graph: CompiledStateGraph<TState, any>,
  threadId: string,
  messageMetadataSchema?: TMessageMetadataSchema
): Promise<{
  messages: UIMessage<never, Omit<TState, 'messages'> & (TMessageMetadataSchema extends z.ZodObject<any> ? z.infer<TMessageMetadataSchema> : Record<never, never>)>[];
  state: Partial<Omit<TState, 'messages'>>;
}> {
  type StateDataParts = Omit<TState, 'messages'>;
  type MessageMetadataParts = TMessageMetadataSchema extends z.ZodObject<any> 
    ? z.infer<TMessageMetadataSchema> 
    : Record<never, never>;
  type DataPartsType = StateDataParts & MessageMetadataParts;
  
  const stateSnapshot = await graph.getState({ configurable: { thread_id: threadId } });
  
  if (!stateSnapshot || !stateSnapshot.values || !('messages' in stateSnapshot.values)) {
    return { messages: [], state: {} };
  }
  
  const messages = (stateSnapshot.values.messages as BaseMessage[]) || [];
  const fullState = stateSnapshot.values as TState;
  
  const globalState: Partial<StateDataParts> = {};
  
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
    
    if (msg instanceof AIMessage && msg.response_metadata && messageMetadataSchema) {
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
