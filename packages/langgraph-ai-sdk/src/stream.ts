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
import { BaseMessage } from '@langchain/core/messages';
import type { 
  LanggraphDataBase,
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
  | ['updates', Record<string, any>]
  | ['custom', any]
  | ['events', EventsStreamEvent];
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

export function getSchemaKeys<T extends z.ZodObject<any>>(
  schema: T | undefined
): Array<keyof z.infer<T>> {
  if (!schema || !schema.shape) return [];
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

  abstract handle(chunk: StreamChunk): Promise<void>;
}
class StructuredMessageToolHandler<TGraphData extends LanggraphDataBase<any, any>> extends Handler<TGraphData> {
  messagePartIds: Record<string, string> = {};
  schemaKeys: string[];
  toolArgsBuffer: string = '';
  toolValues: Record<string, string> = {};
  currentToolName: string | undefined;

  constructor(writer: UIMessageStreamWriter<LanggraphUIMessage<TGraphData>>, messageSchema?: InferMessageSchema<TGraphData>) {
    super(writer, messageSchema);
    this.schemaKeys = messageSchema ? getSchemaKeys(messageSchema).filter((key) => typeof key === 'string') : [];
  }

  async handle(chunk: StreamChunk): Promise<void> {
    if (!this.messageSchema) return;
    if (chunk[0] !== 'messages' && !(Array.isArray(chunk[0]) && chunk[1] === 'messages')) return;

    const data = Array.isArray(chunk[0]) ? chunk[2] : chunk[1];
    const [message, metadata] = data as StreamMessageOutput;

    // Only process messages tagged with 'notify' (from responseNode)
    const notify = metadata.tags?.includes('notify');
    if (!notify) return;

    if (!message || !('tool_call_chunks' in message) || typeof message.tool_call_chunks !== 'object' || !Array.isArray(message.tool_call_chunks)) {
      return;
    }

    // Skip if no tool_call_chunks to process
    if (message.tool_call_chunks.length === 0) {
      return;
    }

    for (const chunk of message.tool_call_chunks) {
      if (isString(chunk.name)) {
        this.currentToolName = chunk.name;
      }

      // Only parse structured tool calls (match "extract" or "extract-*")
      if (!this.currentToolName?.match(/^extract/)) {
        continue;
      }

      const toolArgs = chunk.args;
      this.toolArgsBuffer += toolArgs;

      await this.writeToolCall();
    }
  }

  async writeToolCall(): Promise<void> {
    type TMessage = InferMessage<TGraphData>

    // Parse the accumulated tool call arguments as partial JSON
    const parseResult = await parsePartialJson(this.toolArgsBuffer);
    const parsed = parseResult.value as Partial<TMessage>;

    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      Object.entries(parsed).forEach(([key, value]) => {
        if (this.schemaKeys.includes(key) && !isUndefined(value) && !isNull(value)) {
          const lastValue = this.toolValues[key];
          if (lastValue !== value) {
            this.toolValues[key] = JSON.stringify(value); // Track last sent value

            const messagePartId = this.messagePartIds[key] || crypto.randomUUID();
            this.messagePartIds[key] = messagePartId;
            const structuredMessagePart = {
              type: `data-message-${key}`,
              id: messagePartId,
              data: value,
            };
            this.writer.write(structuredMessagePart as InferUIMessageChunk<LanggraphUIMessage<TGraphData>>);
          }
        }
      });
    }
  }
}

class OtherToolHandler<TGraphData extends LanggraphDataBase<any, any>> extends Handler<TGraphData> {
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
class ToolCallHandler<TGraphData extends LanggraphDataBase<any, any>> extends Handler<TGraphData> {
  messagePartIds: Record<string, string> = {};
  schemaKeys: string[];
  toolArgsBuffer: string = '';
  toolValues: Record<string, any> = {};
  currentToolName: string | undefined;
  handlers: {
    structured_messages: StructuredMessageToolHandler<TGraphData>;
    other_tools: OtherToolHandler<TGraphData>;
  }

  constructor(writer: UIMessageStreamWriter<LanggraphUIMessage<TGraphData>>, messageSchema?: InferMessageSchema<TGraphData>) {
    super(writer, messageSchema);
    this.schemaKeys = messageSchema ? getSchemaKeys(messageSchema).filter((key) => typeof key === 'string') : [];
    this.handlers = {
      structured_messages: new StructuredMessageToolHandler<TGraphData>(writer, messageSchema),
      other_tools: new OtherToolHandler<TGraphData>(writer, messageSchema),
    };
  }
  
  async handle(chunk: StreamChunk): Promise<void> {
    await this.handlers.structured_messages.handle(chunk);
    await this.handlers.other_tools.handle(chunk);
  }

  async handleToolEnd(toolName: string, chunk: StreamChunk): Promise<void> {
    await this.handlers.other_tools.handleToolEnd(toolName, chunk);
  }

  async handleToolError(toolName: string, error: unknown): Promise<void> {
    await this.handlers.other_tools.handleToolError(toolName, error);
  }
}
class RawMessageHandler<TGraphData extends LanggraphDataBase<any, any>> extends Handler<TGraphData> {
  messageBuffer: string = '';
  messagePartId: string | undefined;
  
  async handle(chunk: StreamChunk): Promise<void> {
    if (this.messageSchema) return; // Don't handle raw messages if we have a message schema
    if (chunk[0] !== 'messages' && !(Array.isArray(chunk[0]) && chunk[1] === 'messages')) return;

    const data = Array.isArray(chunk[0]) ? chunk[2] : chunk[1];
    const [message, metadata] = data as StreamMessageOutput;
    const notify = metadata.tags?.includes('notify');
    if (!notify) return;

    if (isUndefined(this.messagePartId)) {
      this.messagePartId = crypto.randomUUID();
    }

    const content = typeof message.content === 'string' ? message.content : '';
    this.messageBuffer += content;

    this.writer.write({
      type: 'data-message-text',
      id: this.messagePartId,
      data: this.messageBuffer,
    } as any);
  }
}

class StateHandler<TGraphData extends LanggraphDataBase<any, any>> extends Handler<TGraphData> {
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

class CustomHandler<TGraphData extends LanggraphDataBase<any, any>> extends Handler<TGraphData> {
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

class EventsHandler<TGraphData extends LanggraphDataBase<any, any>> extends Handler<TGraphData> {
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

class Handlers<TGraphData extends LanggraphDataBase<any, any>> {
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
class LanggraphStreamHandler<TGraphData extends LanggraphDataBase<any, any>> {
  handlers: Handlers<TGraphData>;
  messageSchema?: InferMessageSchema<TGraphData>;

  constructor(writer: UIMessageStreamWriter<LanggraphUIMessage<TGraphData>>, messageSchema?: InferMessageSchema<TGraphData>) {
    this.handlers = new Handlers<TGraphData>(writer, messageSchema);
  }

  async *adaptStreamEvents<TGraphData extends LanggraphDataBase<any, any>>(
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
    // Returns IterableReadableStream<StreamEvent>
    const stream = graph.streamEvents(graphState, {
      version: "v2",
      streamMode: ["updates", "custom", "messages"],
      context: { graphName: graph.name },
      configurable: { thread_id: threadId }
    });

    // Non-event approach
    // Returns IterableReadableStream<["custom", any] | ["messages", StreamOutput] | ["updates", Record<"__start__", UpdateType<StateDefinition>>] | ["values", StateType<StateDefinition>] | ["debug", StreamDebugOutput] | ["checkpoints", StreamCheckpointsOutput<StateType<StateDefinition>>] | ["tasks", StreamTasksOutput<UpdateType<StateDefinition>, StateType<StateDefinition>, "__start__">]>>
    // const stream = await graph.stream(
    //   { messages, ...state },
    //   {
    //     streamMode: ['messages', 'custom', 'events'] as StreamMode[],
    //     context: { graphName: graph.name },
    //     configurable: { thread_id: threadId }
    //   }
    // );
    const eventsStream = this.adaptStreamEvents(stream);

    for await (const chunk of eventsStream) {
      await this.handlers.handle(chunk);
    }
  }
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
