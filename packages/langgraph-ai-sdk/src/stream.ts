import { z } from 'zod';
import { parsePartialJson } from 'ai';
import { kebabCase } from 'change-case';
import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  type InferUIMessageChunk,
  type UIMessageStreamWriter,
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

interface ToolCallChunk {
  id: string;
  index: number;
  name: string;
  args: string;
}

const isUndefined = (value: unknown): value is undefined => {
    return typeof value === 'undefined';
}

const isNull = (value: unknown): value is null => {
    return value === null;
}

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

abstract class Handler<TGraphData extends LanggraphDataBase<any, any>> {
  protected writer: UIMessageStreamWriter<LanggraphUIMessage<TGraphData>>;
  protected messageSchema?: InferMessageSchema<TGraphData>;

  constructor(writer: UIMessageStreamWriter<LanggraphUIMessage<TGraphData>>, messageSchema?: InferMessageSchema<TGraphData>) {
    this.writer = writer;
    this.messageSchema = messageSchema;
  }

  abstract handle(chunk: any): void;
}

class ToolCallHandler<TGraphData extends LanggraphDataBase<any, any>> extends Handler<TGraphData> {
  messagePartIds: Record<string, string> = {};
  schemaKeys: string[];
  toolArgsBuffer: string = '';
  toolValues: Record<string, any> = {}; // Was lastSentValues
  currentToolName: string | undefined;

  constructor(writer: UIMessageStreamWriter<LanggraphUIMessage<TGraphData>>, messageSchema?: InferMessageSchema<TGraphData>) {
    super(writer, messageSchema);
    this.schemaKeys = messageSchema ? getSchemaKeys(messageSchema).filter((key) => typeof key === 'string') : [];
  }
  
  handle(chunk: any): void {
    const [message, metadata] = chunk;
    const notify = metadata.tags?.includes('notify');

    this.handleToolCalls(message, this.messageSchema, notify, this.writer)
    this.handleRawMessages(message, this.messageSchema, notify, this.writer) 
  }
}

class RawMessageHandler<TGraphData extends LanggraphDataBase<any, any>> extends Handler<TGraphData> {
  messageBuffer: string = '';
  
  handle(chunk: any): void {
    const [message, metadata] = chunk;
    const notify = metadata.tags?.includes('notify');

    this.handleRawMessages(message, messageSchema, notify, writer) 
  }
}

class StateHandler<TGraphData extends LanggraphDataBase<any, any>> extends Handler<TGraphData> {
  stateDataParts: Record<string, string> = {};

  handle(chunk: any): void {
    const [message, metadata] = chunk;
    const notify = metadata.tags?.includes('notify');

    this.handleState(message, messageSchema, notify, writer) 
  }
}

class CustomHandler<TGraphData extends LanggraphDataBase<any, any>> extends Handler<TGraphData> {

  handle(chunk: any): void {
    const [message, metadata] = chunk;
    const notify = metadata.tags?.includes('notify');

    this.handleCustom(message, messageSchema, notify, writer) 
  }
}
class LanggraphStreamHandler<TGraphData extends LanggraphDataBase<any, any>> {
  handlers: {
    tool_calls: Handler<TGraphData>;
    raw_messages: Handler<TGraphData>;
    state: Handler<TGraphData>;
    custom: Handler<TGraphData>;
  };
  messageSchema?: InferMessageSchema<TGraphData>;

  constructor(writer: UIMessageStreamWriter<LanggraphUIMessage<TGraphData>>, messageSchema?: InferMessageSchema<TGraphData>) {
    this.handlers = {
      tool_calls: new ToolCallHandler<TGraphData>(writer, messageSchema),
      raw_messages: new RawMessageHandler<TGraphData>(writer, messageSchema),
      state: new StateHandler<TGraphData>(writer, messageSchema),
      custom: new CustomHandler<TGraphData>(writer, messageSchema),
    };
  }
  
  async stream({ graph, messages, threadId, state, messageSchema }: LanggraphBridgeConfig<TGraphData>) {
    this.messageSchema = messageSchema;

    const stream = await graph.stream(
      { messages, ...state },
      {
        streamMode: ['messages', 'updates', 'custom'],
        context: { graphName: graph.name },
        configurable: { thread_id: threadId }
      }
    );

    for await (const chunk of stream) {
      const [message, metadata] = chunk;
      const notify = metadata.tags?.includes('notify');

      this.handlers.tool_calls.handle(chunk);
      this.handlers.raw_messages.handle(chunk);
      this.handlers.state.handle(chunk);
      this.handlers.custom.handle(chunk);
    }
  }
}

const handleToolCalls = <TGraphData extends LanggraphDataBase<any, any>>(data: any, messageSchema: InferMessageSchema<TGraphData>, notify: boolean, writer: any) => {
  const [message, metadata] = data;
  if (!notify) return;
}

const handleRawMessages = <TGraphData extends LanggraphDataBase<any, any>>(data: any, messageSchema: InferMessageSchema<TGraphData>, notify: boolean, writer: any) => {
  const [message, metadata] = data;
  if (!notify) return;
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
      try {
        const handler = new LanggraphStreamHandler(writer, messageSchema);
        await handler.stream({ graph, messages, threadId, state, messageSchema });

        // const stateDataPartIds: Record<string, string> = {};
        // const messagePartIds: Record<string, string> = messageSchema ? {} : { text: crypto.randomUUID() };
        // const messageKeys: string[] = messageSchema ? getSchemaKeys(messageSchema).filter((key) => typeof key === 'string') : [];

        // let messageBuffer = '';
        // let toolArgsBuffer = ''; // Buffer for accumulating tool call arguments
        // let userDefinedStructuredOutput: boolean = false;
        // let lastSentValues: Record<string, any> = {}; // Track what we've already sent
        // let isCapturingJson = false; // Track if we're inside a JSON code block
        // let isFallbackMode = false; // Track if we've switched to fallback text streaming
        // let canEnterFallbackMode = true;
        // let isStructuredComplete = false; // Track if we've completed parsing a structured JSON block
        let currentToolName: string | undefined;

        for await (const chunk of stream) {
          const chunkArray = chunk as StreamChunk;
          let kind: string;
          let data;

          if (chunkArray.length === 2) {
            [kind, data] = chunkArray;
          } else if (chunkArray.length === 3) {
            [, kind, data] = chunkArray;
          } else {
            continue;
          }

          if (kind === 'messages') {
            const [message, metadata] = data;

            if (metadata?.tags?.includes('notify')) {
              if (isStructuredComplete) {
                continue;
              }

              // Handle tool calls (structured output via tool calling)
              if (messageSchema && message?.tool_call_chunks && message.tool_call_chunks.length > 0) {
                message.tool_call_chunks.forEach(async (chunk: ToolCallChunk) => {
                  const toolCallChunk = chunk;
                  if (!isUndefined(toolCallChunk.name) && !isNull(toolCallChunk.name)) {
                    currentToolName = toolCallChunk.name;
                  }
                  const toolArgs = toolCallChunk.args;

                  if (currentToolName && typeof currentToolName === 'string' && currentToolName.match(/^extract-/) && toolArgs) {
                    // Accumulate the tool arguments
                    toolArgsBuffer += toolArgs;

                    // Parse the accumulated tool call arguments as partial JSON
                    const parseResult = await parsePartialJson(toolArgsBuffer);
                    const parsed = parseResult.value as Partial<TMessage>;

                    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                      // Only write parts that have changed
                      Object.entries(parsed).forEach(([key, value]) => {
                        // Only write parts that are in the message schema
                        // Other tool calls we may choose to expose separately
                        if (value !== undefined && messageKeys.includes(key)) {
                          userDefinedStructuredOutput = true; // We're now sure we have a user defined structured output

                          // Check if this value has changed since last send
                          const valueStr = JSON.stringify(value);
                          const lastValueStr = lastSentValues[key];

                          if (valueStr !== lastValueStr) {
                            const partId = messagePartIds[key] || crypto.randomUUID();
                            messagePartIds[key] = partId;
                            lastSentValues[key] = valueStr;

                            const structuredMessagePart = {
                              type: `data-message-${key}`,
                              id: partId,
                              data: value,
                            };
                            writer.write(structuredMessagePart as InferUIMessageChunk<LanggraphUIMessage<TGraphData>>);
                          }
                        }
                      });
                    }

                    // Check if tool call is complete (stop_reason === 'tool_use')
                    if (message.additional_kwargs?.stop_reason === 'tool_use' && userDefinedStructuredOutput) {
                      isStructuredComplete = true;
                      toolArgsBuffer = ''; // Clear the buffer
                      lastSentValues = {}; // Clear tracking for next message
                    }
                  }
                })
              }

              if (!userDefinedStructuredOutput) {
                // Handle regular content
                let content = '';
                if (message?.content) {
                  if (Array.isArray(message.content)) {
                    content = message.content.map((content) => {
                      return content.text;
                    }).join('');
                  } else if (typeof message.content === 'string') {
                    content = message.content;
                  }
                }

                messageBuffer += content;

                if (messageSchema) {
                  // Check if we should enter fallback mode
                  if (!isCapturingJson && canEnterFallbackMode && !isFallbackMode && messageBuffer.length > 200) {
                    // Model has failed to emit a JSON block, switch to fallback mode
                    isFallbackMode = true;
                    // Create the text part ID and stream the accumulated buffer as text
                    const partId = messagePartIds.text || crypto.randomUUID();
                    messagePartIds.text = partId;

                    writer.write({
                      type: 'data-message-text',
                      id: partId,
                      data: messageBuffer,
                    } as any);
                  } else if (isFallbackMode) {
                    // Continue streaming in fallback mode
                    writer.write({
                      type: 'data-message-text',
                      id: messagePartIds.text,
                      data: messageBuffer,
                    } as any);
                  } else if (!isCapturingJson && messageBuffer.includes('```json')) {
                    isCapturingJson = true;
                    canEnterFallbackMode = false;
                    // Discard everything before ```json and start fresh
                    const jsonStartIndex = messageBuffer.indexOf('```json') + 7; // length of '```json'
                    messageBuffer = messageBuffer.substring(jsonStartIndex);
                  }

                  if (!isFallbackMode) {
                    let shouldParse = isCapturingJson;

                    // Check if this chunk contains the closing marker
                    if (isCapturingJson && messageBuffer.includes('```')) {
                      // Only keep content before the closing marker
                      const jsonEndIndex = messageBuffer.indexOf('```');
                      messageBuffer = messageBuffer.substring(0, jsonEndIndex);
                      // Parse one final time with the complete JSON before stopping
                      shouldParse = true;
                      isCapturingJson = false;
                    }

                    // Parse and stream if we're capturing or just finished capturing
                    if (shouldParse) {
                      // Try to parse the accumulated JSON
                      const parseResult = await parsePartialJson(messageBuffer.trim());
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

                        // If we just finished capturing (not still in progress), clear the buffer
                        // to prevent fallback mode from being triggered by subsequent chunks
                        if (!isCapturingJson) {
                          messageBuffer = '';
                        }
                      }
                    }
                  }
                } else {
                  // For unstructured output: stream all content as text
                  writer.write({
                    type: 'data-message-text',
                    id: messagePartIds.text,
                    data: messageBuffer,
                  } as unknown as InferUIMessageChunk<LanggraphUIMessage<TGraphData>>);
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
                if (key === 'messages') return;
                
                const keyStr = String(key) as Exclude<keyof TState, 'messages'> & string;
                const dataPartId = stateDataPartIds[keyStr] || crypto.randomUUID();
                stateDataPartIds[keyStr] = dataPartId;
                
                console.log('Streaming state update:', {
                  type: `data-state-${keyStr}`,
                  id: dataPartId,
                  data: value
                });
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
      } catch (error) {
        console.error('==========================================');
        console.error('STREAM ERROR - FAILING LOUDLY:');
        console.error('==========================================');
        console.error('Error details:', error);
        console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
        console.error('Graph name:', graph.name);
        console.error('Thread ID:', threadId);
        console.error('==========================================');
        throw error; // Re-throw to ensure it propagates
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
