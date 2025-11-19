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
import type { StreamEvent } from "@langchain/core/tracers/log_stream";
import { BaseMessage, AIMessageChunk, ContentBlock } from '@langchain/core/messages';
import { TextBlockParser } from './toStructuredMessage';
import type { 
  LanggraphData,
  LanggraphUIMessage,
  InferState, 
  InferMessage,
  InferMessageSchema,
} from 'langgraph-ai-sdk-types'

type StreamMessageOutput = [BaseMessage, Record<string, any>];

type EventsStreamEvent = {
  id?: string;
  event: "events";
  data: {
    event:
      | `on_${"chat_model" | "llm" | "chain" | "tool" | "retriever" | "prompt"}_${"start" | "stream" | "end"}`
      | (string & {});
    name: string;
    tags: string[];
    run_id: string;
    metadata: Record<string, unknown>;
    parent_ids: string[];
    data: unknown;
  };
};

const TOOL_CALL_REGEX = /^extract/;

type StreamChunk =
  | ['messages', StreamMessageOutput]
  | [string[], 'messages', StreamMessageOutput]
  | ['updates', Record<string, any>]
  | [string[], 'updates', Record<string, any>]
  | ['custom', any]
  | [string[], 'custom', any]
  | ['events', EventsStreamEvent]
  | [string[], 'events', EventsStreamEvent];
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

const isString = (value: unknown): value is string => {
    return typeof value === 'string';
}

export function getSchemaKeys<T extends z.ZodObject<any> | readonly z.ZodObject<any>[]>(
  schema: T | undefined
): string[] {
  if (!schema) return [];

  // Handle array of schemas - collect all keys from all schemas
  if (Array.isArray(schema)) {
    const allKeys = new Set<string>();
    for (const s of schema) {
      if (s && 'shape' in s && s.shape) {
        Object.keys(s.shape).forEach(key => allKeys.add(key));
      }
    }
    return Array.from(allKeys);
  }

  // Handle single schema
  if ('shape' in schema && schema.shape) {
    return Object.keys(schema.shape);
  }

  return [];
}
export interface LanggraphBridgeConfig<
  TGraphData extends LanggraphData<any, any>,
> {
  graph: CompiledStateGraph<InferState<TGraphData>, any, any, any, any, any, any, any>;
  messages: BaseMessage[];
  threadId: string;
  messageSchema?: InferMessageSchema<TGraphData>;
  state?: Partial<InferState<TGraphData>>;
}
abstract class Handler<TGraphData extends LanggraphData<any, any>> {
  protected writer: UIMessageStreamWriter<LanggraphUIMessage<TGraphData>>;
  protected messageSchema?: InferMessageSchema<TGraphData>;

  constructor(writer: UIMessageStreamWriter<LanggraphUIMessage<TGraphData>>, messageSchema?: InferMessageSchema<TGraphData>) {
    this.writer = writer;
    this.messageSchema = messageSchema;
  }

  abstract handle(chunk: StreamChunk): Promise<void>;
}

class OtherToolHandler<TGraphData extends LanggraphData<any, any>> extends Handler<TGraphData> {
  currentToolName: string | undefined;
  toolCallStates: Map<string, {
    id: string;
    name: string;
    argsBuffer: string;
    completed?: boolean;
  }> = new Map();

  async handle(chunk: StreamChunk): Promise<void> {
    if (chunk[0] !== 'messages' && !(Array.isArray(chunk[0]) && chunk[1] === 'messages')) return;

    const data = Array.isArray(chunk[0]) ? chunk[2] : chunk[1];
    const [message, metadata] = data as StreamMessageOutput;
    const notify = metadata.tags?.includes('notify');

    if (!notify) return;
    if (!message || !('tool_call_chunks' in message) || typeof message.tool_call_chunks !== 'object' || !Array.isArray(message.tool_call_chunks)) return;

    for (const chunk of message.tool_call_chunks) {
      if (isString(chunk.name)) {
        this.currentToolName = chunk.name;
      }
      if (this.currentToolName?.match(TOOL_CALL_REGEX)) continue;

      const toolName = this.currentToolName;
      
      if (!toolName) continue;

      let toolState = this.toolCallStates.get(toolName);
      const toolCallId = toolState?.id || crypto.randomUUID();
      
      if (!toolState) {
        toolState = {
          id: toolCallId,
          name: toolName,
          argsBuffer: '',
        };
        this.toolCallStates.set(toolName, toolState);

        this.writer.write({
          type: 'tool-input-start',
          toolCallId,
          toolName
        } as InferUIMessageChunk<LanggraphUIMessage<TGraphData>>);
      }

      toolState.argsBuffer += chunk.args || '';

      const parseResult = await parsePartialJson(toolState.argsBuffer);
      const parsedInput = parseResult.value;

      if (parsedInput) {
        this.writer.write({
          type: 'tool-input-available',
          toolCallId,
          toolName: toolState.name,
          input: parsedInput
        } as InferUIMessageChunk<LanggraphUIMessage<TGraphData>>);
      }
    }
  }

  async handleToolEnd(toolName: string, chunk: StreamChunk): Promise<void> {
    const toolState = this.toolCallStates.get(toolName);
    if (!toolState || toolState.completed) return;

    toolState.completed = true;
    const [type, data] = chunk;

    this.writer.write({
      type: 'tool-output-available',
      toolCallId: toolState.id,
      output: data?.data?.data?.output
    } as unknown as InferUIMessageChunk<LanggraphUIMessage<TGraphData>>);
  }

  async handleToolError(toolName: string, error: unknown): Promise<void> {
    const toolState = this.toolCallStates.get(toolName);
    if (!toolState || toolState.completed) return;

    toolState.completed = true;

    this.writer.write({
      type: 'tool-output-error',
      toolCallId: toolState.id,
      errorText: String(error)
    } as unknown as InferUIMessageChunk<LanggraphUIMessage<TGraphData>>);
  }
}
class ToolCallHandler<TGraphData extends LanggraphData<any, any>> extends Handler<TGraphData> {
  handlers: {
    other_tools: OtherToolHandler<TGraphData>;
  }

  constructor(writer: UIMessageStreamWriter<LanggraphUIMessage<TGraphData>>, messageSchema?: InferMessageSchema<TGraphData>) {
    super(writer, messageSchema);
    this.handlers = {
      other_tools: new OtherToolHandler<TGraphData>(writer, messageSchema),
    };
  }
  
  async handle(chunk: StreamChunk): Promise<void> {
    await this.handlers.other_tools.handle(chunk);
  }

  async handleToolEnd(toolName: string, chunk: StreamChunk): Promise<void> {
    await this.handlers.other_tools.handleToolEnd(toolName, chunk);
  }

  async handleToolError(toolName: string, error: unknown): Promise<void> {
    await this.handlers.other_tools.handleToolError(toolName, error);
  }
}
class RawMessageHandler<TGraphData extends LanggraphData<any, any>> extends Handler<TGraphData> {
  private parsers: Map<number, TextBlockParser> = new Map();

  constructor(writer: UIMessageStreamWriter<LanggraphUIMessage<TGraphData>>, messageSchema?: InferMessageSchema<TGraphData>) {
    super(writer, messageSchema);
  }

  isRawMessageChunk = (chunk: StreamChunk): boolean => {
    if (chunk[0] !== 'messages' && !(Array.isArray(chunk[0]) && chunk[1] === 'messages')) return false;
    return true;
  }

  getOrCreateParser(index: number): TextBlockParser {
    if (!this.parsers.has(index)) {
      this.parsers.set(index, new TextBlockParser(index));
    }
    return this.parsers.get(index)!;
  }
  
  async handle(chunk: StreamChunk): Promise<void> {
    if (!this.isRawMessageChunk(chunk)) return;

    const data = Array.isArray(chunk[0]) ? chunk[2] : chunk[1];
    const [message, metadata] = data as StreamMessageOutput;
    const notify = metadata.tags?.includes('notify');
    if (!notify) return;

    if (!AIMessageChunk.isInstance(message)) return;
    if (!message.content || !Array.isArray(message.content)) return;

    for (const block of message.content) {
      await this.handleContentBlock(block);
    }
  }

  async handleContentBlock(block: ContentBlock): Promise<void> {
    const index = (block as any).index ?? 0;

    if (block.type === 'text') {
      await this.handleTextBlock(block, index);
    } else if (block.type === 'reasoning') {
      await this.handleReasoningBlock(block, index);
    }
  }

  async handleReasoningBlock(block: ContentBlock, index: number): Promise<void> {
    const parser = this.getOrCreateParser(index);
    parser.append((block as ContentBlock.Reasoning).text);
    
    this.writer.write({
      type: 'data-content-block-reasoning',
      id: parser.id,
      data: {
        index,
        text: parser.getContent(),
      },
    } as unknown as InferUIMessageChunk<LanggraphUIMessage<TGraphData>>);
  }

  async handleTextBlock(block: ContentBlock, index: number): Promise<void> {
    const parser = this.getOrCreateParser(index);
    parser.append((block as ContentBlock.Text).text);

    if (this.messageSchema) {
      const [isStructured, parsed] = await parser.tryParseStructured();
      
      if (parser.hasJsonStart() && !parser.hasEmittedPreamble) {
        const preamble = parser.getPreamble();
        if (preamble) {
          parser.hasEmittedPreamble = true;
          this.writer.write({
            type: 'data-content-block-text',
            id: parser.textId,
            data: {
              index: parser.index,
              text: preamble,
            },
          } as unknown as InferUIMessageChunk<LanggraphUIMessage<TGraphData>>);
        }
      }
      
      if (parser.hasJsonStart() && isStructured && parsed) {
        this.writer.write({
          type: 'data-content-block-structured',
          id: parser.structuredId,
          data: {
            index: parser.index + 1,
            data: parsed,
            sourceText: parser.getContent(),
          },
        } as unknown as InferUIMessageChunk<LanggraphUIMessage<TGraphData>>);
      }
    } else {
      this.writer.write({
        type: 'data-content-block-text',
        id: parser.textId,
        data: {
          index: parser.index,
          text: parser.getContent(),
        },
      } as unknown as InferUIMessageChunk<LanggraphUIMessage<TGraphData>>);
    }

  }
}

class StateHandler<TGraphData extends LanggraphData<any, any>> extends Handler<TGraphData> {
  stateDataParts: Record<string, string> = {};
  dataPartIds: Record<string, string> = {};

  async handle(chunk: StreamChunk): Promise<void> {
    type TState = InferState<TGraphData>
    type StateDataParts = Omit<TState, 'messages'>;

    const data = Array.isArray(chunk[0]) ? chunk[2] : chunk[1];
    const updates = data as TState;

    for (const [nodeName, nodeUpdates] of Object.entries(updates)) {
      if (!nodeUpdates || typeof nodeUpdates !== 'object') continue;
      
      Object.entries(nodeUpdates).forEach(([key, value]) => {
        if (key === 'messages') return;
        if (isUndefined(value) || isNull(value)) return;
        
        const keyStr = String(key) as Exclude<keyof TState, 'messages'> & string;
        const dataPartId = this.dataPartIds[keyStr] || crypto.randomUUID();
        this.dataPartIds[keyStr] = dataPartId;
        
        this.writer.write({
          type: `data-state-${keyStr}`,
          id: dataPartId,
          data: value
        } as InferUIMessageChunk<LanggraphUIMessage<TGraphData>>);
      });
    }
  }
}

class CustomHandler<TGraphData extends LanggraphData<any, any>> extends Handler<TGraphData> {
  async handle(chunk: StreamChunk): Promise<void> {
    const data = Array.isArray(chunk[0]) ? chunk[2] : chunk[1];
    const defaultKeys = ['id', 'event'];
    const eventName = data.event;
    if (!eventName || !data.id) return;
    
    const dataKeys = Object.entries(data).reduce((acc, [key, value]) => {
      if (typeof key === 'string' && !defaultKeys.includes(key)) {
        acc[key] = value;
      }
      return acc;
    }, {} as Record<string, any>);

    this.writer.write({
      type: kebabCase(`data-custom-${eventName}`),
      id: data.id,
      data: dataKeys,
    } as InferUIMessageChunk<LanggraphUIMessage<TGraphData>>);
  }
}

class EventsHandler<TGraphData extends LanggraphData<any, any>> extends Handler<TGraphData> {
  toolCallHandler: ToolCallHandler<TGraphData>;

  constructor(writer: UIMessageStreamWriter<LanggraphUIMessage<TGraphData>>, messageSchema: InferMessageSchema<TGraphData> | undefined, toolCallHandler: ToolCallHandler<TGraphData>) {
    super(writer, messageSchema);
    this.toolCallHandler = toolCallHandler;
  }

  async handle(chunk: StreamChunk): Promise<void> {
    if (chunk[0] !== 'events') return;

    const eventsData = chunk[1] as EventsStreamEvent;
    const event = eventsData.data.event;
    const name = eventsData.data.name;
    const data = eventsData.data.data;

    if (event === 'on_tool_end') {
      await this.toolCallHandler.handleToolEnd(name, chunk);
    } else if (event === 'on_tool_error') {
      await this.toolCallHandler.handleToolError(name, data);
    }
  }
}

class Handlers<TGraphData extends LanggraphData<any, any>> {
  tool_calls: ToolCallHandler<TGraphData>;
  raw_messages: Handler<TGraphData>;
  state: Handler<TGraphData>;
  custom: Handler<TGraphData>;
  events: EventsHandler<TGraphData>;

  constructor(writer: UIMessageStreamWriter<LanggraphUIMessage<TGraphData>>, messageSchema?: InferMessageSchema<TGraphData>) {
    this.tool_calls = new ToolCallHandler<TGraphData>(writer, messageSchema);
    this.raw_messages = new RawMessageHandler<TGraphData>(writer, messageSchema);
    this.state = new StateHandler<TGraphData>(writer, messageSchema);
    this.custom = new CustomHandler<TGraphData>(writer, messageSchema);
    this.events = new EventsHandler<TGraphData>(writer, messageSchema, this.tool_calls);
  }

  async handle(chunk: StreamChunk): Promise<void> {
    const type = Array.isArray(chunk[0]) ? chunk[1] : chunk[0];

    if (type === 'messages') {
      await this.tool_calls.handle(chunk);
      await this.raw_messages.handle(chunk);
    } else if (type === 'updates') {
      await this.state.handle(chunk);
    } else if (type === 'custom') {
      await this.custom.handle(chunk);
    } else if (type === 'events') {
      await this.events.handle(chunk);
    }
  }
}
class LanggraphStreamHandler<TGraphData extends LanggraphData<any, any>> {
  handlers: Handlers<TGraphData>;
  messageSchema?: InferMessageSchema<TGraphData>;

  constructor(writer: UIMessageStreamWriter<LanggraphUIMessage<TGraphData>>, messageSchema?: InferMessageSchema<TGraphData>) {
    this.handlers = new Handlers<TGraphData>(writer, messageSchema);
  }

  async *adaptStreamEvents(
    stream: AsyncIterable<StreamEvent>
  ): AsyncGenerator<StreamChunk> {
    for await (const event of stream) {
      // Handle state/message/custom events from on_chain_stream
      if (event.event === "on_chain_stream") {
        const chunk = event.data.chunk;

        // Extract [mode, data] tuple (or [namespace, mode, data] if subgraphs)
        const [modeOrNs, dataOrMode, maybeData] = Array.isArray(chunk)
          ? chunk
          : [null, ...chunk];

        const mode = maybeData !== undefined ? dataOrMode : modeOrNs;
        const data = maybeData !== undefined ? maybeData : dataOrMode;

        if (mode === "messages" || mode === "updates" || mode === "custom") {
          yield [mode, data] as StreamChunk;
        }
      }
      // Handle lifecycle events (tool start/end, etc.)
      else if (event.event.startsWith("on_")) {
        yield ["events", {
          event: "events",
          data: event
        }] as StreamChunk;
      }
    }
  }
  
  async stream({ graph, messages, threadId, state, messageSchema }: LanggraphBridgeConfig<TGraphData>) {
    this.messageSchema = messageSchema;

    // Must use streamEvents to get events output (including tool_call_end)
    // so we can detect lifecycle events properly
    const graphState = { messages, ...state }
    const stream = graph.streamEvents(graphState, {
      version: "v2",
      streamMode: ["messages", "updates", "custom"],
      context: { graphName: graph.name },
      configurable: { thread_id: threadId }
    });

    const eventsStream = this.adaptStreamEvents(stream);

    for await (const chunk of eventsStream) {
      await this.handlers.handle(chunk);
    }
  }
}

export function createLanggraphUIStream<
  TGraphData extends LanggraphData<any, any>,
>({
  graph,
  messages,
  threadId,
  messageSchema,
  state,
}: LanggraphBridgeConfig<TGraphData>) {
  return createUIMessageStream<LanggraphUIMessage<TGraphData>>({
    execute: async ({ writer }) => {
      try {
        const handler = new LanggraphStreamHandler<TGraphData>(writer, messageSchema);
        await handler.stream({ graph, messages, threadId, state, messageSchema });
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
  TGraphData extends LanggraphData<any, any>,
>(
  options: LanggraphBridgeConfig<TGraphData>
): Response {
  const stream = createLanggraphUIStream<TGraphData>(options);
  return createUIMessageStreamResponse({ stream });
}

export async function loadThreadHistory<
  TGraphData extends LanggraphData<any, any>,
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
    const parts = [];
    
    if (isUser) {
      const content = typeof msg.content === 'string' ? msg.content : '';
      parts.push({
        type: 'text',
        id: crypto.randomUUID(),
        text: content
      });
    } else {
      const parsedBlocks = (msg.response_metadata as any)?.parsed_blocks;
      
      if (parsedBlocks && Array.isArray(parsedBlocks)) {
        parsedBlocks.forEach((block: any) => {
          if (block.type === 'structured' && block.parsed) {
            parts.push({
              type: 'data-content-block-structured',
              id: block.id,
              data: {
                index: block.index ?? 0,
                data: block.parsed,
                sourceText: block.sourceText,
              },
            });
          } else if (block.type === 'text') {
            parts.push({
              type: 'data-content-block-text',
              id: block.id,
              data: {
                index: block.index ?? 0,
                text: block.sourceText,
              },
            });
          } else if (block.type === 'reasoning') {
            parts.push({
              type: 'data-content-block-reasoning',
              id: block.id,
              data: {
                index: block.index ?? 0,
                text: block.sourceText,
              },
            });
          } else if (block.type === 'tool_call') {
            parts.push({
              type: `tool-${block.toolName}`,
              id: block.id,
              index: block.index ?? 0,
              toolCallId: block.toolCallId,
              toolName: block.toolName,
              input: block.toolArgs ? JSON.parse(block.toolArgs) : {},
            });
          }
        });
      }
    }
    
    return {
      id: `msg-${idx}`,
      role: isUser ? 'user' : 'assistant',
      parts
    } as LanggraphUIMessage<TGraphData>;
  });
  console.log(JSON.stringify(uiMessages))
  
  return { messages: uiMessages, state: globalState };
}
