import { v7 as uuidv7 } from 'uuid';
import type { BaseMessage } from '@langchain/core/messages';
import { HumanMessage, SystemMessage, AIMessage } from '@langchain/core/messages';
import { createLanggraphStreamResponse, loadThreadHistory } from './stream';
import { ensureThread } from './ops';
import type { UIMessage } from 'ai';
import type { LanggraphData, InferMessageSchema } from 'langgraph-ai-sdk-types';
import { CompiledStateGraph } from '@langchain/langgraph';

function convertUIMessagesToLanggraph(messages: UIMessage[]): BaseMessage[] {
  return messages.map((msg) => {
    const textPart = msg.parts.find(p => p.type === 'text');
    const text = textPart?.type === 'text' ? textPart.text : '';

    switch (msg.role) {
      case 'user':
        return new HumanMessage(text);
      case 'system':
        return new SystemMessage(text);
      case 'assistant':
        return new AIMessage(text);
      default:
        throw new Error(`Unknown role: ${msg.role}`);
    }
  });
}

/**
 * Core function that works with parsed data - framework agnostic
 * Use this when you've already parsed the request body (e.g., in Hono, Express, etc.)
 */
export async function streamLanggraph<TGraphData extends LanggraphData<any, any>>({
  graph,
  messageSchema,
  messages,
  state = {},
  threadId,
}: {
  graph: CompiledStateGraph<any, any, any, any, any, any, any, any>;
  messageSchema?: InferMessageSchema<TGraphData>;
  messages: UIMessage[];
  state?: any;
  threadId?: string;
}): Promise<Response> {
  let finalThreadId = threadId;

  const langGraphMessages = convertUIMessagesToLanggraph(messages);
  const newMessage = langGraphMessages.at(-1);

  if (!newMessage) {
    return new Response(
      JSON.stringify({ error: 'No messages provided' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const response = createLanggraphStreamResponse<TGraphData>({
    graph,
    messages: [newMessage],
    threadId: finalThreadId,
    state,
    messageSchema,
  });

  response.headers.set('X-Thread-ID', finalThreadId);

  return response;
}

/**
 * Core function that works with parsed data - framework agnostic
 * Use this when you've already extracted the threadId from the request (e.g., in Hono, Express, etc.)
 */
export async function fetchLanggraphHistory<TGraphData extends LanggraphData<any, any>>({
  graph,
  messageSchema,
  threadId,
}: {
  graph: CompiledStateGraph<any, any, any, any, any, any, any, any>;
  messageSchema?: InferMessageSchema<TGraphData>;
  threadId: string;
}): Promise<Response> {
  if (!threadId) {
    return new Response(
      JSON.stringify({ error: 'threadId required' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  if (!graph) {
    return new Response(
      JSON.stringify({ error: `Graph not found` }),
      { status: 404, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const { messages, state } = await loadThreadHistory<TGraphData>(
    graph,
    threadId,
    messageSchema
  );

  return new Response(
    JSON.stringify({ messages, state }),
    { headers: { 'Content-Type': 'application/json' } }
  );
}