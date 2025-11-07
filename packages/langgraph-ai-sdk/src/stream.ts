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

// parseToolCalls
// parseMessages
// parseState
// parseCustom
// accept the writer
// communicate with other parsers... eg. (Should parse messages? Could we prevent this through configuration?)
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
      try {
        const stream = await graph.stream(
          { messages, ...state },
          {
            streamMode: ['messages', 'updates', 'custom'],
            context: { graphName: graph.name },
            configurable: { thread_id: threadId }
          }
        );

        writer.write({
          type: 'data-stream-start',
          id: crypto.randomUUID(),
          data: { status: 'streaming' }
        } as InferUIMessageChunk<LanggraphUIMessage<TGraphData>>);

        const stateDataPartIds: Record<string, string> = {};
        const messagePartIds: Record<string, string> = messageSchema ? {} : { text: crypto.randomUUID() };
        const messageKeys: string[] = messageSchema ? getSchemaKeys(messageSchema).filter((key) => typeof key === 'string') : [];
        let messageBuffer = '';
        let toolArgsBuffer = ''; // Buffer for accumulating tool call arguments
        let userDefinedStructuredOutput: boolean = false;
        let lastSentValues: Record<string, any> = {}; // Track what we've already sent
        let isCapturingJson = false; // Track if we're inside a JSON code block
        let isFallbackMode = false; // Track if we've switched to fallback text streaming
        let canEnterFallbackMode = true;
        let isStructuredComplete = false; // Track if we've completed parsing a structured JSON block
        let currentToolName: string | undefined;
        
        const toolCallBuffers: Record<string, { name: string; argsBuffer: string; id: string }> = {};
        const toolCallStates: Record<string, 'input-streaming' | 'input-available' | 'output-available'> = {};

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

            if (metadata?.tags?.includes('notify')) {
              if (isStructuredComplete) {
                continue;
              }

              // Handle tool calls (both structured output and regular tools)
              if (message?.tool_call_chunks && message.tool_call_chunks.length > 0) {
                message.tool_call_chunks.forEach(async (chunk: ToolCallChunk) => {
                  const toolCallChunk = chunk;
                  const toolCallId = toolCallChunk.id || 'unknown';
                  
                  if (!isUndefined(toolCallChunk.name) && !isNull(toolCallChunk.name)) {
                    currentToolName = toolCallChunk.name;
                    
                    if (!toolCallBuffers[toolCallId]) {
                      toolCallBuffers[toolCallId] = {
                        name: toolCallChunk.name,
                        argsBuffer: '',
                        id: toolCallId
                      };
                      toolCallStates[toolCallId] = 'input-streaming';
                    }
                  }
                  
                  const toolArgs = toolCallChunk.args;
                  if (!toolArgs || !currentToolName) return;
                  
                  const toolBuffer = toolCallBuffers[toolCallId];
                  if (!toolBuffer) return;
                  
                  toolBuffer.argsBuffer += toolArgs;

                  // Structured output tool calls
                  if (messageSchema && currentToolName.match(/^extract-/)) {
                    toolArgsBuffer += toolArgs;

                    const parseResult = await parsePartialJson(toolArgsBuffer);
                    const parsed = parseResult.value as Partial<TMessage>;

                    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                      Object.entries(parsed).forEach(([key, value]) => {
                        if (value !== undefined && messageKeys.includes(key)) {
                          userDefinedStructuredOutput = true;

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

                    if (message.additional_kwargs?.stop_reason === 'tool_use' && userDefinedStructuredOutput) {
                      isStructuredComplete = true;
                      toolArgsBuffer = '';
                      lastSentValues = {};
                    }
                  } else {
                    const parseResult = await parsePartialJson(toolBuffer.argsBuffer);
                    const parsedInput = parseResult.value;

                    writer.write({
                      type: `tool-${currentToolName}`,
                      toolCallId: toolCallId,
                      state: 'input-streaming',
                      input: parsedInput || undefined,
                    } as any);

                    if (message.additional_kwargs?.stop_reason === 'tool_use') {
                      toolCallStates[toolCallId] = 'input-available';
                      
                      writer.write({
                        type: `tool-${currentToolName}`,
                        toolCallId: toolCallId,
                        state: 'input-available',
                        input: parsedInput,
                      } as any);
                    }
                  }
                })
              }
              
              if (message?._getType && message._getType() === 'tool') {
                const toolCallId = message.tool_call_id;
                const toolBuffer = toolCallBuffers[toolCallId];
                
                if (toolBuffer && toolCallStates[toolCallId] !== 'output-available') {
                  toolCallStates[toolCallId] = 'output-available';
                  
                  const toolOutput = typeof message.content === 'string' ? message.content : JSON.stringify(message.content);
                  
                  writer.write({
                    type: `tool-${toolBuffer.name}`,
                    toolCallId: toolCallId,
                    state: 'output-available',
                    input: parsePartialJson(toolBuffer.argsBuffer).value,
                    output: toolOutput,
                  } as any);
                }
                
                continue;
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
